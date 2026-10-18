import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, optionalDate, flag } from '../utils/validators.js';
import { STAFF, requireAnyRole, checkRole } from '../utils/authz.js';
import { schoolYearFilter, resolveSchoolYear, schoolYearIdFor, localDate } from './school-years.service.js';

export async function patient(id, connection = pool) {
  const [rows] = await connection.execute(
    'SELECT id,name,college,course,year,category FROM patients WHERE id=?',
    [id]
  );
  return rows[0];
}

/**
 * Search by name or ID for the patient pickers. With a school year (an id or 'current') only the students
 * enrolled in that year are listed; without one, every student in the system.
 */
export async function searchPatients(search, actor, schoolYear = '') {
  const term = (search || '').trim().slice(0, 200);
  const hideConfidential = actor && actor.role !== 'doctor' ? 'AND v.confidential = 0' : '';
  const year = await resolveSchoolYear(schoolYear);
  const join = year ? 'JOIN student_enrollments e ON e.patient_id = p.id AND e.school_year_id = ?' : '';
  const side = year ? 'e' : 'p';
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, ${side}.college AS college, ${side}.course AS course, ${side}.year AS year, p.category,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS date_of_birth,
            (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id ${hideConfidential}) AS last_visit
     FROM patients p ${join}
     WHERE INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0
     ORDER BY p.name, p.id LIMIT 500`,
    [...(year ? [year.id] : []), term, term]
  );
  return rows.map(listedPatient);
}

function listedPatient(r) {
  return {
    id: r.id, name: r.name, college: r.college, course: r.course, year: r.year, category: r.category,
    dateOfBirth: r.date_of_birth || null,
    lastVisit: r.last_visit ? String(r.last_visit).slice(0, 10) : null,
    // Laboratory requirements done / needed (only the Student Records page asks for them)
    requirementsDone: r.req_done === undefined ? undefined : Number(r.req_done),
    requirementsNeeded: r.req_needed === undefined ? undefined : Number(r.req_needed)
  };
}

/**
 * One page of the Student Records list. The search, the college filter and the counts all run on the
 * server, so every student can be reached by scrolling, however many there are.
 * With a school year chosen, only the students enrolled in that year are listed and counted (a new year
 * starts empty); with none chosen, every student in the system.
 * Returns { patients, total (for this filter), all (for this search), colleges: [{ name, count }] }.
 */
export async function searchPatientsPage({ search, college, limit, offset, schoolYear, requirements }, actor) {
  const term = (search || '').trim().slice(0, 200);
  const chosen = (college || '').trim().slice(0, 255);
  const size = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);
  const hideConfidential = actor && actor.role !== 'doctor' ? 'AND v.confidential = 0' : '';
  // With a school year chosen, "last visit" is the last visit inside that year (empty at the start of a new year).
  const year = await schoolYearFilter(schoolYear);
  const inYear = year.conditions.map(c => ' AND ' + c).join('');
  const join = year.year ? 'JOIN student_enrollments e ON e.patient_id = p.id AND e.school_year_id = ?' : '';
  const side = year.year ? 'e' : 'p';              // college, course and year level as they were in that school year
  const joinParams = year.year ? [year.year.id] : [];
  const reqJoin = 'LEFT JOIN student_requirements r ON r.patient_id = p.id';
  const reqFilter = REQUIREMENT_FILTERS[String(requirements || '')] || '';   // 'incomplete' or 'complete'
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, ${side}.college AS college, ${side}.course AS course, ${side}.year AS year, p.category,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS date_of_birth,
            (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id ${hideConfidential}${inYear}) AS last_visit,
            ${DONE_SQL} AS req_done, ${NEEDED_SQL} AS req_needed
     FROM patients p ${join} ${reqJoin}
     WHERE (INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0)
       AND (? = '' OR ${side}.college = ?)${reqFilter}
     ORDER BY p.name, p.id LIMIT ${size} OFFSET ${skip}`,
    [...year.params, ...joinParams, term, term, chosen, chosen]
  );
  const [groups] = await pool.execute(
    `SELECT ${side}.college AS college, COUNT(*) AS n FROM patients p ${join} ${reqJoin}
     WHERE (INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0)${reqFilter}
     GROUP BY ${side}.college ORDER BY ${side}.college`,
    [...joinParams, term, term]
  );
  const all = groups.reduce((sum, g) => sum + Number(g.n), 0);
  const match = groups.find(g => String(g.college || '').toLowerCase() === chosen.toLowerCase());
  return {
    patients: rows.map(listedPatient),
    total: chosen ? (match ? Number(match.n) : 0) : all,
    all,
    colleges: groups.filter(g => g.college).map(g => ({ name: g.college, count: Number(g.n) }))
  };
}

export async function assertPatient(patientId) {
  const [rows] = await pool.execute('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!rows[0]) throw new HttpError(404, 'Patient not found.');
}

// ---------- patients ----------
function parseIdentity(body) {
  const lastName = text(body.lastName, 'Last name', 100, true);
  const firstName = text(body.firstName, 'First name', 100, true);
  const middleName = text(body.middleName, 'Middle name', 100);
  const gender = text(body.gender, 'Gender', 10);
  if (gender && !['Male', 'Female'].includes(gender)) throw new HttpError(400, 'Select a valid gender.');
  const dateOfBirth = optionalDate(body.dateOfBirth, 'Date of birth');
  const category = body.category === 'employee' ? 'employee' : 'student';
  const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
  if (name.length > 200) throw new HttpError(400, 'Patient name is too long.');
  const college = text(body.college, 'College', 255);
  const course = text(body.course, 'Course', 100);
  const year = text(body.year, 'Year', 20);
  return {
    name, lastName, firstName, middleName, college, course, year, category,
    gender: gender || null, dateOfBirth,
    civilStatus: text(body.civilStatus, 'Civil status', 20),
    nationality: text(body.nationality, 'Nationality', 50) || 'Filipino',
    contactNumber: text(body.contactNumber, 'Contact number', 30),
    address: text(body.address, 'Address', 300),
    guardianName: text(body.guardianName, 'Guardian name', 200),
    guardianContact: text(body.guardianContact, 'Guardian contact', 30)
  };
}

// ---------- enrollment (one student list per school year) ----------
/**
 * Puts a student on a school year's list. With `fields` (college, course, year) the year's details are saved
 * (updated if the student is already on that list); without, the student's current details are copied.
 * Does nothing when no school year exists yet. Returns true when a new enrollment row was added.
 */
export async function enrollPatient(patientId, schoolYearId, fields = null, connection = pool) {
  if (!schoolYearId) return false;
  const now = new Date().toISOString();
  if (fields) {
    const [result] = await connection.execute(
      `INSERT INTO student_enrollments(patient_id, school_year_id, college, course, year, created_at)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE college = VALUES(college), course = VALUES(course), year = VALUES(year)`,
      [patientId, schoolYearId, fields.college, fields.course, fields.year, now]
    );
    return result.affectedRows === 1;
  }
  const [result] = await connection.execute(
    `INSERT IGNORE INTO student_enrollments(patient_id, school_year_id, college, course, year, created_at)
     SELECT id, ?, college, course, year, ? FROM patients WHERE id = ?`,
    [schoolYearId, now, patientId]
  );
  return result.affectedRows === 1;
}

/** Keeps the lists consistent: a student who gets a visit is on the list of the school year the visit is dated in. */
export async function enrollForVisit(patientId, visitDate, connection = pool) {
  const yearId = await schoolYearIdFor(visitDate || localDate());
  await enrollPatient(patientId, yearId, null, connection);
}

export async function registerPatient(body, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const id = text(body.id, 'Patient ID', 50, true);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new HttpError(400, 'Patient ID may only contain letters, numbers, dots, dashes, and underscores.');
  }
  const f = parseIdentity(body);
  const target = await resolveSchoolYear('current');      // new students go on today's school year list
  let reEnrolled = false;
  try {
    await withTransaction(async connection => {
      const [found] = await connection.execute('SELECT id FROM patients WHERE id = ? FOR UPDATE', [id]);
      if (!found[0]) {
        await connection.execute(
          `INSERT INTO patients(id, name, college, course, year, category, last_name, first_name,
             middle_name, gender, date_of_birth, civil_status, nationality, contact_number, address,
             guardian_name, guardian_contact)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id, f.name, f.college, f.course, f.year, f.category, f.lastName, f.firstName,
            f.middleName, f.gender, f.dateOfBirth, f.civilStatus, f.nationality, f.contactNumber, f.address,
            f.guardianName, f.guardianContact
          ]
        );
        await enrollPatient(id, target && target.id, f, connection);
        return;
      }
      // Already in the system from an earlier school year: enroll them again instead of rejecting the ID.
      if (target) {
        const [on] = await connection.execute(
          'SELECT 1 FROM student_enrollments WHERE patient_id = ? AND school_year_id = ?', [id, target.id]
        );
        if (on[0]) throw new HttpError(409, `This student is already enrolled in school year ${target.label}.`);
      } else {
        throw new HttpError(409, 'A patient with this ID already exists.');
      }
      // Only the school-year details change; the rest of the student's profile is left alone.
      await connection.execute(
        `UPDATE patients SET college = IF(? = '', college, ?), course = IF(? = '', course, ?), year = IF(? = '', year, ?)
         WHERE id = ?`,
        [f.college, f.college, f.course, f.course, f.year, f.year, id]
      );
      await enrollPatient(id, target.id, f, connection);
      reEnrolled = true;
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A patient with this ID already exists.');
    throw error;
  }
  return {
    id, name: f.name, college: f.college, course: f.course, year: f.year, category: f.category,
    reEnrolled, schoolYear: target ? target.label : null
  };
}

function patientOf(r) {
  return {
    id: r.id, name: r.name, category: r.category,
    lastName: r.last_name || '', firstName: r.first_name || '', middleName: r.middle_name || '',
    college: r.college || '', course: r.course || '', year: r.year || '',
    gender: r.gender || '', dateOfBirth: r.date_of_birth || '',
    civilStatus: r.civil_status || '', nationality: r.nationality || '',
    contactNumber: r.contact_number || '', address: r.address || '',
    guardianName: r.guardian_name || '', guardianContact: r.guardian_contact || ''
  };
}

/** One patient with every field on the Add/Edit Student form. */
export async function getPatient(id) {
  const [rows] = await pool.execute(
    `SELECT id, name, category, last_name, first_name, middle_name, college, course, year, gender,
            DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth, civil_status, nationality,
            contact_number, address, guardian_name, guardian_contact
     FROM patients WHERE id = ?`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Patient not found.');
  return patientOf(rows[0]);
}

/** Nurse edits a student. The ID never changes; the full name is rebuilt from its parts. */
export async function updatePatient(id, body, actor) {
  checkRole(actor, 'nurse');
  await assertPatient(id);
  const f = parseIdentity(body);
  await pool.execute(
    `UPDATE patients SET name=?, last_name=?, first_name=?, middle_name=?, college=?, course=?, year=?,
       gender=?, date_of_birth=?, civil_status=?, nationality=?, contact_number=?, address=?,
       guardian_name=?, guardian_contact=?
     WHERE id=?`,
    [f.name, f.lastName, f.firstName, f.middleName, f.college, f.course, f.year, f.gender,
     f.dateOfBirth, f.civilStatus, f.nationality, f.contactNumber, f.address,
     f.guardianName, f.guardianContact, id]
  );
  // The college, course and year level also change on this school year's list, if the student is on it.
  const current = await resolveSchoolYear('current');
  if (current) {
    await pool.execute(
      'UPDATE student_enrollments SET college = ?, course = ?, year = ? WHERE patient_id = ? AND school_year_id = ?',
      [f.college, f.course, f.year, id, current.id]
    );
  }
  return getPatient(id);
}

function historyOf(row) {
  const r = row || {};
  return {
    asthma: Number(r.asthma) === 1,
    allergy: Number(r.allergy) === 1,
    allergyDetails: r.allergy_details || '',
    febrileConvulsion: Number(r.febrile_convulsion) === 1,
    faintingSpell: Number(r.fainting_spell) === 1,
    epilepsy: Number(r.epilepsy) === 1,
    vaccines: r.vaccines || '',
    otherCondition: r.other_condition || '',
    asthmaLastAttack: r.asthma_last_attack || '',
    asthmaMedicine: r.asthma_medicine || '',
    allergyFood: r.allergy_food || '',
    allergyMedicine: r.allergy_medicine || '',
    hepatitisB: Number(r.hepatitis_b) === 1
  };
}

export async function getHistory(patientId) {
  await assertPatient(patientId);
  const [rows] = await pool.execute('SELECT * FROM patient_medical_history WHERE patient_id = ?', [patientId]);
  return historyOf(rows[0]);
}

export async function saveHistory(patientId, body, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  await assertPatient(patientId);
  await pool.execute(
    `INSERT INTO patient_medical_history(patient_id, asthma, allergy, allergy_details,
       febrile_convulsion, fainting_spell, epilepsy, vaccines, other_condition, updated_at, updated_by,
       asthma_last_attack, asthma_medicine, allergy_food, allergy_medicine, hepatitis_b)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE asthma = VALUES(asthma), allergy = VALUES(allergy),
       allergy_details = VALUES(allergy_details), febrile_convulsion = VALUES(febrile_convulsion),
       fainting_spell = VALUES(fainting_spell), epilepsy = VALUES(epilepsy),
       vaccines = VALUES(vaccines), other_condition = VALUES(other_condition),
       asthma_last_attack = VALUES(asthma_last_attack), asthma_medicine = VALUES(asthma_medicine),
       allergy_food = VALUES(allergy_food), allergy_medicine = VALUES(allergy_medicine),
       hepatitis_b = VALUES(hepatitis_b),
       updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [
      patientId, flag(body.asthma), flag(body.allergy),
      text(body.allergyDetails, 'Allergy details', 300),
      flag(body.febrileConvulsion), flag(body.faintingSpell), flag(body.epilepsy),
      text(body.vaccines, 'Vaccines', 300),
      text(body.otherCondition, 'Other condition', 300),
      new Date().toISOString(), actor.id,
      text(body.asthmaLastAttack, 'Date of last asthma attack', 50),
      text(body.asthmaMedicine, 'Asthma medicine', 300),
      text(body.allergyFood, 'Food allergy', 300),
      text(body.allergyMedicine, 'Allergy medicine', 300),
      flag(body.hepatitisB)
    ]
  );
  return getHistory(patientId);
}

// ---------- laboratory requirements (needed by every student before graduating) ----------
// Same order as the paper Laboratory Request. `column` holds the date it was marked done (NULL = missing).
// The pregnancy test does not apply to male students: it is not counted for them.
export const REQUIREMENTS = [
  { key: 'cbc', label: 'CBC', column: 'cbc_on' },
  { key: 'cxrPa', label: 'CXR-PA', column: 'cxr_pa_on' },
  { key: 'urinalysis', label: 'Urinalysis', column: 'urinalysis_on' },
  { key: 'fecalysis', label: 'Fecalysis', column: 'fecalysis_on' },
  { key: 'hepaBScreening', label: 'Hepa-B Screening', column: 'hepa_b_screening_on' },
  { key: 'hepaBTiter', label: 'Hepa-B Titer', column: 'hepa_b_titer_on' },
  { key: 'bloodType', label: 'Blood Type', column: 'blood_type_on' },
  { key: 'pregnancyTest', label: 'Pregnancy Test', column: 'pregnancy_test_on', notForMale: true },
  { key: 'drugTest', label: 'Drug Test', column: 'drug_test_on' }
];

// SQL for the Requirements column and filter on the Student Records list (needs `p` = patients and
// `r` = student_requirements, LEFT JOINed). A missing row counts as nothing done.
const done = c => `(r.${c} IS NOT NULL)`;
const DONE_SQL = '(' + REQUIREMENTS.map(x => (x.notForMale
  ? `(${done(x.column)} AND COALESCE(p.gender, '') <> 'Male')`
  : done(x.column))).join(' + ') + ')';
const NEEDED_SQL = `(${REQUIREMENTS.length} - IF(COALESCE(p.gender, '') = 'Male', 1, 0))`;
const REQUIREMENT_FILTERS = {
  incomplete: ` AND ${DONE_SQL} < ${NEEDED_SQL}`,
  complete: ` AND ${DONE_SQL} >= ${NEEDED_SQL}`
};

function requirementsOf(row, gender) {
  const r = row || {};
  const male = gender === 'Male';
  const items = REQUIREMENTS.map(x => ({
    key: x.key,
    label: x.label,
    applicable: !(x.notForMale && male),
    done: Boolean(r[x.column]),
    date: r[x.column] || null
  }));
  const needed = items.filter(i => i.applicable);
  const completed = needed.filter(i => i.done).length;
  return { items, completed, required: needed.length, complete: completed === needed.length };
}

export async function getRequirements(patientId) {
  await assertPatient(patientId);
  const [rows] = await pool.execute('SELECT * FROM student_requirements WHERE patient_id = ?', [patientId]);
  const [people] = await pool.execute('SELECT gender FROM patients WHERE id = ?', [patientId]);
  return requirementsOf(rows[0], people[0].gender);
}

/**
 * Saves the ticked requirements. A box that stays ticked keeps the date it was first ticked; a newly ticked
 * box gets today's date; an unticked box goes back to missing. A key missing from the body is left as it was,
 * so a form that did not load the student can never wipe their requirements.
 */
export async function saveRequirements(patientId, body, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  await assertPatient(patientId);
  for (const x of REQUIREMENTS) {
    if (body[x.key] !== undefined && typeof body[x.key] !== 'boolean') {
      throw new HttpError(400, `${x.label} must be ticked or not ticked.`);
    }
  }
  const today = localDate();
  await withTransaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT * FROM student_requirements WHERE patient_id = ? FOR UPDATE', [patientId]
    );
    const before = rows[0] || {};
    const dates = REQUIREMENTS.map(x => {
      if (body[x.key] === undefined) return before[x.column] || null;
      if (!body[x.key]) return null;
      return before[x.column] || today;
    });
    const columns = REQUIREMENTS.map(x => x.column);
    await connection.execute(
      `INSERT INTO student_requirements(patient_id, ${columns.join(', ')}, updated_at, updated_by)
       VALUES(?, ${columns.map(() => '?').join(', ')}, ?, ?)
       ON DUPLICATE KEY UPDATE ${columns.map(c => `${c} = VALUES(${c})`).join(', ')},
         updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
      [patientId, ...dates, new Date().toISOString(), actor.id]
    );
  });
  return getRequirements(patientId);
}

export async function getPatientRecord(id, actor, { schoolYear = '' } = {}) {
  const patientId = text(id, 'Patient ID', 50, true);
  const record = await patient(patientId);

  if (!record) throw new HttpError(404, 'Patient record not found.');

  const year = await schoolYearFilter(schoolYear);
  const [visits] = await pool.execute(
    `SELECT v.id, v.visit_type, v.visit_date, v.complaint,
            v.systolic, v.diastolic, v.weight_kg, v.height_cm,
            v.bmi, v.bmi_status, v.bp_status, v.diagnosis,
            v.notes, v.confidential, v.created_by_name, v.created_at,
            v.lab_source_name, v.lab_source_location, v.lab_received_at
     FROM visits v
     WHERE v.patient_id = ?
       AND (? = 'doctor' OR v.confidential = 0)
       AND v.screened_copy_of IS NULL${year.conditions.map(c => ' AND ' + c).join('')}
     ORDER BY v.visit_date DESC, v.id DESC`,
    [patientId, actor.role, ...year.params]
  );

  return {
    ...record,
    visits: visits.map(row => ({
      id: row.id,
      visitType: row.visit_type,
      visitDate: row.visit_date,
      complaint: Number(row.confidential) === 1 ? 'Confidential' : row.complaint,
      bp: row.systolic == null || row.diastolic == null ? '' : `${row.systolic}/${row.diastolic}`,
      bpStatus: row.bp_status || '',
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      heightCm: row.height_cm == null ? null : Number(row.height_cm),
      bmi: row.bmi == null ? null : Number(row.bmi),
      bmiStatus: row.bmi_status || '',
      diagnosis: Number(row.confidential) === 1 ? 'Confidential' : row.diagnosis,
      notes: Number(row.confidential) === 1 ? '' : row.notes || '',
      confidential: Number(row.confidential) === 1,
      createdByName: row.created_by_name,
      labSourceName: Number(row.confidential) === 1 ? '' : row.lab_source_name || '',
      labSourceLocation: Number(row.confidential) === 1 ? '' : row.lab_source_location || '',
      labReceivedAt: row.lab_received_at || null,
      createdAt: row.created_at
    }))
  };
}
