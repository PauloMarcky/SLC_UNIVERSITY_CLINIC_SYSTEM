import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, number, validDate, flag } from '../utils/validators.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';
import { patient, assertPatient } from './patients.service.js';
import { parseItems, createPrescriptionInTx, getPrescription } from './prescriptions.service.js';

export const VISIT_TYPES = ['Consultation', 'Checkup'];

export function parseBp(value) {
  const match = /^(\d{2,3})\/(\d{2,3})$/.exec(text(value, 'Blood pressure', 10, true));
  if (!match) throw new HttpError(400, 'Blood pressure must look like 120/80.');
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 160 || systolic <= diastolic) {
    throw new HttpError(400, 'Enter a realistic blood pressure, such as 120/80.');
  }
  return { systolic, diastolic };
}

export function bmiOf(weightKg, heightCm) {
  const meters = heightCm / 100;
  const bmi = Math.round((weightKg / (meters * meters)) * 10) / 10;
  const status = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  return { bmi, status };
}

export function bpStatusOf(systolic, diastolic) {
  if (systolic >= 140 || diastolic >= 90) return 'Hypertension Stage 2';
  if (systolic >= 130 || diastolic >= 80) return 'Hypertension Stage 1';
  if (systolic >= 120) return 'Elevated';
  return 'Normal';
}

// Confidential visits are hidden from everyone except doctors.
export function rowToVisit(row, role) {
  const hidden = Number(row.confidential) === 1 && role !== 'doctor';
  return {
    id: row.id,
    patientId: hidden ? null : row.patient_id,
    patientName: hidden ? 'Student (hidden)' : row.patient_name,
    college: row.college,
    visitType: row.visit_type,
    visitDate: row.visit_date,
    complaint: hidden ? 'Confidential' : row.complaint,
    diagnosis: hidden ? 'Confidential' : row.diagnosis,
    notes: hidden ? '' : row.notes || '',
    bp: `${row.systolic}/${row.diastolic}`,
    bpStatus: row.bp_status,
    weightKg: Number(row.weight_kg),
    heightCm: Number(row.height_cm),
    bmi: Number(row.bmi),
    bmiStatus: row.bmi_status,
    confidential: Number(row.confidential) === 1,
    createdByName: row.created_by_name,
    status: row.status,
    isScreened: Number(row.is_screened) === 1,
    screenedNote: hidden ? '' : row.screened_note || '',
    screenedAt: row.screened_at || null,
    doctorName: row.doctor_name || null,
    nurseName: row.nurse_name || null,
    pulseRate: row.pulse_rate == null ? null : Number(row.pulse_rate),
    initialDiagnosis: row.initial_diagnosis || '',
    externalLabsAttached: Number(row.external_labs_attached) === 1,
    sentToHospital: Number(row.sent_to_hospital) === 1,
    course: row.course || '',
    age: row.date_of_birth ? Math.floor((Date.now() - new Date(row.date_of_birth).getTime()) / 31557600000) : null,
    actionsTaken: hidden ? '' : row.actions_taken || '',
    soapObjective: hidden ? '' : row.soap_objective || '',
    sex: row.gender || '',
    yearLevel: row.year || '',
    visitNumber: Number(row.visit_number) || 1,
    bodyTemperature: row.body_temperature == null ? null : Number(row.body_temperature),
    screenedCopyOf: row.screened_copy_of == null ? null : Number(row.screened_copy_of),
    createdAt: row.created_at
  };
}

export const SELECT_VISIT = `SELECT v.*, p.name AS patient_name, p.college, p.course, p.year, p.gender, p.date_of_birth,
                             (SELECT COUNT(*) FROM visits vc WHERE vc.patient_id = v.patient_id AND vc.screened_copy_of IS NULL AND vc.id <= v.id) AS visit_number
                      FROM visits v JOIN patients p ON p.id = v.patient_id`;

const BMI_GROUPS = ['Underweight', 'Normal', 'Overweight', 'Obese'];
const MAX_PAGE_SIZE = 2000;
const DEFAULT_PAGE_SIZE = 50;

// Paging is only used when the caller sends page or pageSize. Without them the old behaviour stays: newest 200, no total.
function pagingOf({ page, pageSize }) {
  if (page === undefined && pageSize === undefined) return null;
  const size = pageSize === undefined ? DEFAULT_PAGE_SIZE : Number(pageSize);
  const number = page === undefined ? 1 : Number(page);
  if (!Number.isInteger(size) || size < 1) throw new HttpError(400, 'pageSize must be a whole number of 1 or more.');
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, 'page must be a whole number of 1 or more.');
  const limit = Math.min(size, MAX_PAGE_SIZE);
  return { limit, offset: (number - 1) * limit, page: number, pageSize: limit };
}

// Filters shared by both lists. `dateColumn` is the column the "from" date is compared with (both hold YYYY-MM-DD text).
function filterOf({ search = '', from = '', bmi = '', sentToHospital = '' }, actor, dateColumn, where, params) {
  const term = String(search).trim().slice(0, 200);
  if (term) {
    where.push('(INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0)');
    params.push(term, term);
    // Stop non-doctors from finding hidden patients by searching their name.
    if (actor.role !== 'doctor') where.push('v.confidential = 0');
  }
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new HttpError(400, 'from must look like 2026-10-17.');
    where.push(`${dateColumn} >= ?`);
    params.push(from);
  }
  if (bmi) {
    if (!BMI_GROUPS.includes(bmi)) throw new HttpError(400, 'Invalid BMI group.');
    where.push('v.bmi_status = ?');
    params.push(bmi);
  }
  if (sentToHospital === '1' || sentToHospital === 'true') where.push('v.sent_to_hospital = 1');
}

async function runList(where, params, orderBy, paging, actor) {
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  // limit and offset are checked whole numbers, so they are safe to write into the SQL text.
  const limit = paging ? `LIMIT ${paging.limit} OFFSET ${paging.offset}` : 'LIMIT 200';
  const [rows] = await pool.execute(`${SELECT_VISIT} ${clause} ORDER BY ${orderBy} ${limit}`, params);
  const visits = rows.map(row => rowToVisit(row, actor.role));
  if (!paging) return { visits };
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS n FROM visits v JOIN patients p ON p.id = v.patient_id ${clause}`, params
  );
  return { visits, total: Number(count[0].n), page: paging.page, pageSize: paging.pageSize };
}

export async function listVisits(query, actor) {
  const { type = '', college = '', excludeScreenedCopies = '' } = query;
  const paging = pagingOf(query);
  const where = ["v.status = 'completed'"];
  const params = [];
  filterOf(query, actor, 'v.visit_date', where, params);
  if (type) {
    if (!VISIT_TYPES.includes(type)) throw new HttpError(400, 'Invalid visit type.');
    where.push('v.visit_type = ?');
    params.push(type);
  }
  if (college) {
    where.push('p.college = ?');
    params.push(college.slice(0, 100));
  }
  // The Checkup page lists the original checkup, not its Screening copy.
  if (excludeScreenedCopies === '1' || excludeScreenedCopies === 'true') where.push('v.screened_copy_of IS NULL');
  return runList(where, params, 'v.visit_date DESC, v.id DESC', paging, actor);
}

export async function createVisit(body, actor) {
  if (actor.role !== 'doctor') throw new HttpError(403, 'Only a doctor can record a visit.');
  const isNew = body.isNew === true;
  const givenPatientId = text(body.patientId, 'Patient ID', 50, true);
  if (isNew && !/^[A-Za-z0-9._-]+$/.test(givenPatientId)) {
    throw new HttpError(400, 'Patient ID may only contain letters, numbers, dots, dashes, and underscores.');
  }
  const visitType = text(body.visitType, 'Visit type', 20, true);
  if (!VISIT_TYPES.includes(visitType)) throw new HttpError(400, 'Select a valid visit type.');
  const diagnosis = text(body.diagnosis, 'Clinical diagnosis', 500, true);
  const { systolic, diastolic } = parseBp(body.bp);
  const weight = number(body.weight, 'Weight', 1, 500);
  const height = number(body.height, 'Height', 30, 300);
  const { bmi, status } = bmiOf(weight, height);
  const visitDate = validDate(body.visitDate);
  const complaint = text(body.complaint, 'Complaint', 500, true);
  const notes = text(body.notes, 'Notes', 5000);
  const rxItems = parseItems(body.prescription);   // validated before anything is saved
  const confidential = body.confidential === true || body.confidential === 'true' ? 1 : 0;

  // Patient details are only used when a new patient is being added.
  const newPatient = {
    name: text(body.patientName, 'Patient name', 200, isNew),
    college: text(body.college, 'College', 100),
    course: text(body.course, 'Course', 100),
    year: text(body.year, 'Year', 20),
    category: body.category === 'employee' ? 'employee' : 'student'
  };

  const created = await withTransaction(async connection => {
    const patientId = givenPatientId;
    const existing = await patient(patientId, connection);
    if (isNew) {
      // New patient: the ID is typed by the doctor and must not be in use yet.
      if (existing) {
        throw new HttpError(409, 'A patient with this ID already exists. Choose "Existing patient" instead.');
      }
      await connection.execute(
        'INSERT INTO patients(id, name, college, course, year, category) VALUES(?,?,?,?,?,?)',
        [patientId, newPatient.name, newPatient.college, newPatient.course, newPatient.year, newPatient.category]
      );
    } else if (!existing) {
      throw new HttpError(400, 'Select an existing patient record.');
    }
    const [result] = await connection.execute(
      `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
         weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
         created_by, created_by_name, created_at, doctor_id, doctor_name, completed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        patientId, visitType, visitDate, complaint, systolic, diastolic, weight, height,
        bmi, status, bpStatusOf(systolic, diastolic), diagnosis, notes, confidential,
        actor.id, actor.name, new Date().toISOString(),
        actor.id, actor.name, new Date().toISOString()
      ]
    );
    // Same transaction: if stock is short or the prescription is invalid, the visit is not saved either.
    const rxId = await createPrescriptionInTx(
      connection, { visitId: result.insertId, patientId, items: rxItems }, actor
    );
    return { visitId: result.insertId, rxId };
  });
  const [rows] = await pool.execute(`${SELECT_VISIT} WHERE v.id = ?`, [created.visitId]);
  const visit = rowToVisit(rows[0], actor.role);
  visit.prescription = created.rxId ? await getPrescription(created.rxId, actor) : null;
  return visit;
}

async function fetchVisit(id, actor) {
  const [rows] = await pool.execute(`${SELECT_VISIT} WHERE v.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Visit not found.');
  return rowToVisit(rows[0], actor.role);
}

// ---------- nurse triage ----------
export async function triageVisit(body, actor) {
  requireAnyRole(actor, ['nurse'], 'Only a nurse can record triage.');
  const patientId = text(body.patientId, 'Patient ID', 50, true);
  await assertPatient(patientId);
  const visitType = text(body.visitType, 'Visit type', 20, true);
  if (!VISIT_TYPES.includes(visitType)) throw new HttpError(400, 'Select a valid visit type.');
  const visitDate = validDate(body.visitDate);
  const complaint = text(body.complaint, 'Complaint', 500, true);
  const { systolic, diastolic } = parseBp(body.bp);
  const weight = number(body.weight, 'Weight', 1, 500);
  const height = number(body.height, 'Height', 30, 300);
  const { bmi, status } = bmiOf(weight, height);
  const rawPulse = body.pulseRate;
  const pulse = rawPulse === undefined || rawPulse === null || String(rawPulse).trim() === ''
    ? null
    : Math.round(number(rawPulse, 'Pulse rate', 20, 250));
  const initialDiagnosis = text(body.initialDiagnosis, 'Initial diagnosis', 200);
  const rawTemp = body.temperature;
  const temperature = rawTemp === undefined || rawTemp === null || String(rawTemp).trim() === ''
    ? null
    : number(rawTemp, 'Body temperature', 30, 45);
  const [result] = await pool.execute(
    `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,'','',0,?,?,?,'triaged',?,?,?,?,?,?)`,
    [
      patientId, visitType, visitDate, complaint, systolic, diastolic, weight, height,
      bmi, status, bpStatusOf(systolic, diastolic),
      actor.id, actor.name, new Date().toISOString(),
      actor.id, actor.name, pulse, initialDiagnosis, flag(body.externalLabsAttached), temperature
    ]
  );
  return fetchVisit(result.insertId, actor);
}

// ---------- doctor queue ----------
export async function queueVisits(actor) {
  requireAnyRole(actor, ['doctor', 'nurse'], 'Only clinic staff can view the exam queue.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.status = 'triaged' ORDER BY v.visit_date ASC, v.id ASC LIMIT 200`
  );
  return rows.map(row => rowToVisit(row, actor.role));
}

export async function completeVisit(id, body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can complete a visit.');
  // Free text, as in the clinic's Excel record. The doctor decides what is confidential.
  const diagnosis = text(body.diagnosis, 'Clinical diagnosis', 500, true);
  const soapObjective = text(body.soapObjective, 'Pertinent P.E. and laboratory findings', 5000);
  const actionsTaken = text(body.actionsTaken, 'Action taken', 5000);
  const confidential = flag(body.confidential) ? 1 : 0;
  const rxItems = parseItems(body.prescription);   // validated before anything is saved
  const screenedNote = text(body.screenedNote, 'Screening note', 300);
  const wantsScreening = body.putToScreening === true;

  const rxId = await withTransaction(async connection => {
    const [found] = await connection.execute(
      'SELECT id, patient_id, visit_type, status FROM visits WHERE id = ? FOR UPDATE', [id]
    );
    const visit = found[0];
    if (!visit) throw new HttpError(404, 'Visit not found.');
    if (visit.status !== 'triaged') throw new HttpError(409, 'This visit has already been completed.');
    const screen = wantsScreening && visit.visit_type === 'Checkup';
    const now = new Date().toISOString();
    // The original stays a plain Checkup; Screening gets its own copy (below).
    await connection.execute(
      `UPDATE visits SET diagnosis = ?, confidential = ?, status = 'completed',
         doctor_id = ?, doctor_name = ?, completed_at = ?,
         soap_objective = ?, actions_taken = ?, sent_to_hospital = ?
       WHERE id = ?`,
      [
        diagnosis, confidential, actor.id, actor.name, now,
        soapObjective, actionsTaken, flag(body.sentToHospital),
        id
      ]
    );
    if (screen) await copyToScreening(connection, id, actor, screenedNote, now);
    return createPrescriptionInTx(
      connection, { visitId: id, patientId: visit.patient_id, items: rxItems }, actor
    );
  });
  const result = await fetchVisit(id, actor);
  result.prescription = rxId ? await getPrescription(rxId, actor) : null;
  return result;
}

// ---------- screening ----------
// A screened checkup is saved twice: the original stays in Checkup, and this copy goes to Screening.
async function copyToScreening(connection, visitId, actor, note, when) {
  await connection.execute(
    `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name, doctor_id, doctor_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature,
       soap_subjective, soap_objective, soap_assessment, soap_plan, actions_taken,
       sent_to_hospital, completed_at, is_screened, screened_by, screened_at, screened_note,
       screened_copy_of)
     SELECT patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name, doctor_id, doctor_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature,
       soap_subjective, soap_objective, soap_assessment, soap_plan, actions_taken,
       sent_to_hospital, completed_at, 1, ?, ?, ?, id
       FROM visits WHERE id = ?`,
    [actor.id, when, note, visitId]
  );
}

export async function screenVisit(id, body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can put a checkup to screening.');
  const note = text(body.screenedNote, 'Screening note', 300);
  await withTransaction(async connection => {
    const [found] = await connection.execute(
      `SELECT id FROM visits WHERE id = ? AND visit_type = 'Checkup' AND status = 'completed'
         AND is_screened = 0 AND screened_copy_of IS NULL FOR UPDATE`,
      [id]
    );
    if (!found[0]) {
      throw new HttpError(409, 'Only a completed checkup that is not yet screened can be put to screening.');
    }
    const [already] = await connection.execute('SELECT id FROM visits WHERE screened_copy_of = ? LIMIT 1', [id]);
    if (already[0]) throw new HttpError(409, 'This checkup is already in Screening.');
    await copyToScreening(connection, id, actor, note, new Date().toISOString());
  });
  return fetchVisit(id, actor);
}

export async function screenedVisits(actor, query = {}) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const paging = pagingOf(query);
  const where = ['v.is_screened = 1'];
  const params = [];
  filterOf(query, actor, 'v.screened_at', where, params);
  return runList(where, params, 'v.screened_at DESC, v.id DESC', paging, actor);
}
