// School years. Records restart every school year, but nothing is ever moved or deleted: a visit
// belongs to the school year its visit_date falls in, worked out each time from the dates below.
// The doctor edits the dates, so the visits move with them.
//
//   * Today's school year ("current") is the one with the latest start date that is not after today.
//   * A school year lasts from its start date until the next school year starts. Visits dated in the
//     summer break (after the end date, before the next start) stay with the year that just ended.
//   * When a school year has ended and no later one exists, the next one is created automatically
//     (same dates, one year later). The doctor can edit it at any time.
import { pool } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, dateText, idFrom } from '../utils/validators.js';
import { requireAnyRole } from '../utils/authz.js';

const MAX_AUTO_YEARS = 25;          // safety limit when catching up after a long gap
const MAX_SPAN_DAYS = 548;          // a school year longer than about 18 months is almost surely a typo

const two = n => String(n).padStart(2, '0');

/** Today on the server clock (local time), as YYYY-MM-DD. */
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const dayNumber = iso => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftYears(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();   // Feb 29 -> Feb 28
  return `${y + years}-${two(m)}-${two(Math.min(d, lastDay))}`;
}

/** "2026-2027" from the two dates ("2026" if both are in the same calendar year). */
export function defaultLabel(startDate, endDate) {
  const a = startDate.slice(0, 4);
  const b = endDate.slice(0, 4);
  return a === b ? a : `${a}-${b}`;
}

async function allRows(connection = pool) {
  const [rows] = await connection.execute(
    'SELECT id, label, start_date, end_date FROM school_years ORDER BY start_date ASC'
  );
  return rows;
}

/** Creates the next school year(s) once the latest one has ended. Safe to call on every request. */
async function ensureUpcoming() {
  const today = localDate();
  for (let i = 0; i < MAX_AUTO_YEARS; i += 1) {
    const [rows] = await pool.execute('SELECT label, start_date, end_date FROM school_years ORDER BY start_date DESC LIMIT 1');
    const last = rows[0];
    if (!last || today <= last.end_date) return;
    let start = shiftYears(last.start_date, 1);
    let end = shiftYears(last.end_date, 1);
    if (start <= last.end_date) start = shiftDays(last.end_date, 1);   // the doctor stretched the last year
    if (end <= start) end = shiftDays(shiftYears(start, 1), -1);
    const label = defaultLabel(start, end);
    const now = new Date().toISOString();
    const insert = name => pool.execute(
      'INSERT INTO school_years(label, start_date, end_date, created_at, updated_at) VALUES(?,?,?,?,?)',
      [name, start, end, now, now]
    );
    try {
      await insert(label);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      try { await insert(`${label} (${start})`); }
      catch (again) { if (again.code !== 'ER_DUP_ENTRY') throw again; }   // another request just made it
    }
  }
}

/** Index of today's school year in rows (sorted by start date), or -1 if there are none. */
function currentIndex(rows, today) {
  let found = -1;
  rows.forEach((row, index) => { if (row.start_date <= today) found = index; });
  return found === -1 && rows.length ? 0 : found;   // before the first start date: the first year
}

function describe(rows, index, today, current, visitCount) {
  const row = rows[index];
  const next = rows[index + 1];
  const status = index === current ? 'current' : index < current ? 'past' : 'upcoming';
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    // Last day that still counts for this year (the day before the next year starts); null = no limit.
    coversUntil: next ? shiftDays(next.start_date, -1) : null,
    status,
    isCurrent: index === current,
    visitCount: visitCount ?? null
  };
}

async function countVisits(startDate, coversUntil) {
  const params = [startDate];
  let upper = '';
  if (coversUntil) { upper = ' AND visit_date <= ?'; params.push(coversUntil); }
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM visits
      WHERE status NOT IN ('cancelled', 'missed') AND screened_copy_of IS NULL AND visit_date >= ?${upper}`,
    params
  );
  return Number(rows[0].n);
}

/** Every school year, newest first, with its status and how many visits it holds. */
export async function listSchoolYears() {
  await ensureUpcoming();
  return buildList();
}

async function buildList() {
  const rows = await allRows();
  const today = localDate();
  const current = currentIndex(rows, today);
  const years = [];
  for (let i = 0; i < rows.length; i += 1) {
    const base = describe(rows, i, today, current, null);
    years.push({ ...base, visitCount: await countVisits(base.startDate, base.coversUntil) });
  }
  years.reverse();
  return { schoolYears: years, currentId: current >= 0 ? rows[current].id : null, today };
}

/**
 * Id of the school year a date falls in (the year with the latest start date not after it), or null if none exist.
 * Read-only: unlike the lists, it never creates the next school year.
 */
export async function schoolYearIdFor(dateIso) {
  const rows = await allRows();
  if (!rows.length) return null;
  const index = currentIndex(rows, dateIso);
  return index < 0 ? null : rows[index].id;
}

/**
 * The school year named by a query value: '' = none (no filter), 'current', or a numeric id.
 * Returns { id, label, startDate, endDate } where endDate is the last day that counts (or null), or null for no filter.
 */
export async function resolveSchoolYear(value) {
  const wanted = String(value ?? '').trim();
  if (!wanted) return null;
  if (wanted !== 'current' && !/^\d+$/.test(wanted)) throw new HttpError(400, 'Invalid school year.');
  await ensureUpcoming();
  const rows = await allRows();
  let index;
  if (wanted === 'current') {
    index = currentIndex(rows, localDate());
    if (index < 0) return null;                       // no school years set up yet: show everything
  } else {
    index = rows.findIndex(r => r.id === Number(wanted));
    if (index < 0) throw new HttpError(404, 'School year not found.');
  }
  const next = rows[index + 1];
  return {
    id: rows[index].id,
    label: rows[index].label,
    startDate: rows[index].start_date,
    endDate: next ? shiftDays(next.start_date, -1) : null
  };
}

/**
 * SQL conditions (and their values) that keep only visits inside a school year.
 * `column` is the visit date column. An empty value means "all school years": no conditions.
 */
export async function schoolYearFilter(value, column = 'v.visit_date') {
  const year = await resolveSchoolYear(value);
  if (!year) return { year: null, conditions: [], params: [] };
  const conditions = [`${column} >= ?`];
  const params = [year.startDate];
  if (year.endDate) { conditions.push(`${column} <= ?`); params.push(year.endDate); }
  return { year, conditions, params };
}

// ---------- doctor edits ----------
function parseYear(body) {
  const startDate = dateText(body.startDate, 'Start date');
  const endDate = dateText(body.endDate, 'End date');
  if (endDate <= startDate) throw new HttpError(400, 'The end date must be after the start date.');
  if (dayNumber(endDate) - dayNumber(startDate) > MAX_SPAN_DAYS) {
    throw new HttpError(400, 'A school year cannot be longer than 18 months. Check the dates.');
  }
  const label = text(body.label, 'School year name', 50) || defaultLabel(startDate, endDate);
  return { label, startDate, endDate };
}

async function assertNoOverlap(year, exceptId) {
  const [rows] = await pool.execute(
    'SELECT label FROM school_years WHERE start_date <= ? AND end_date >= ? AND id <> ? LIMIT 1',
    [year.endDate, year.startDate, exceptId]
  );
  if (rows[0]) throw new HttpError(409, `These dates overlap school year ${rows[0].label}.`);
}

function duplicate(error) {
  if (error.code !== 'ER_DUP_ENTRY') return error;
  return new HttpError(409, /label/i.test(error.message)
    ? 'A school year with this name already exists.'
    : 'A school year already starts on this date.');
}

// Used after the doctor adds or edits a year. It does not run the automatic "next year" step, so a year the
// doctor just added is never followed by a surprise year before the doctor has added the next real one.
async function described(id) {
  const { schoolYears } = await buildList();
  return schoolYears.find(y => y.id === id);
}

export async function createSchoolYear(body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can manage school years.');
  const year = parseYear(body);
  await assertNoOverlap(year, 0);
  const now = new Date().toISOString();
  try {
    const [result] = await pool.execute(
      'INSERT INTO school_years(label, start_date, end_date, created_at, updated_at, updated_by) VALUES(?,?,?,?,?,?)',
      [year.label, year.startDate, year.endDate, now, now, actor.id]
    );
    return described(result.insertId);
  } catch (error) { throw duplicate(error); }
}

export async function updateSchoolYear(idValue, body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can manage school years.');
  const id = idFrom(String(idValue));
  const [found] = await pool.execute('SELECT id FROM school_years WHERE id = ?', [id]);
  if (!found[0]) throw new HttpError(404, 'School year not found.');
  const year = parseYear(body);
  await assertNoOverlap(year, id);
  try {
    await pool.execute(
      'UPDATE school_years SET label = ?, start_date = ?, end_date = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [year.label, year.startDate, year.endDate, new Date().toISOString(), actor.id, id]
    );
  } catch (error) { throw duplicate(error); }
  return described(id);
}

/** Only an empty school year can be removed: deleting one with visits would silently move them to the year before. */
export async function deleteSchoolYear(idValue, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can manage school years.');
  const id = idFrom(String(idValue));
  const rows = await allRows();
  const index = rows.findIndex(r => r.id === id);
  if (index < 0) throw new HttpError(404, 'School year not found.');
  const info = describe(rows, index, localDate(), currentIndex(rows, localDate()), null);
  const visits = await countVisits(info.startDate, info.coversUntil);
  if (visits > 0) {
    throw new HttpError(409, `School year ${info.label} has ${visits} visit record${visits === 1 ? '' : 's'}, so it cannot be deleted. Edit its dates instead.`);
  }
  const [enrolled] = await pool.execute('SELECT COUNT(*) AS n FROM student_enrollments WHERE school_year_id = ?', [id]);
  if (Number(enrolled[0].n) > 0) {
    throw new HttpError(409, `School year ${info.label} has ${enrolled[0].n} enrolled student${Number(enrolled[0].n) === 1 ? '' : 's'}, so it cannot be deleted.`);
  }
  await pool.execute('DELETE FROM school_years WHERE id = ?', [id]);
  return { id, deleted: true };
}
