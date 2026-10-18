import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, number, validDate, dateText, flag } from '../utils/validators.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';
import { patient, assertPatient } from './patients.service.js';
import { parseItems, createPrescriptionInTx, getPrescription } from './prescriptions.service.js';
import { schoolYearFilter } from './school-years.service.js';

export const VISIT_TYPES = ['Consultation', 'Checkup'];

// Today's date on the server clock (local time, not UTC), as YYYY-MM-DD.
function localDate() {
  const d = new Date();
  const two = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

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

export const CHECKUP_RESULTS = ['Cleared', 'Needs screening'];

const isBlank = value => value === undefined || value === null || String(value).trim() === '';

/**
 * Blood pressure, weight and height. A Consultation needs all three. For a Checkup each one is optional,
 * but a value that is typed must still be realistic. BMI needs both weight and height; BP status needs BP.
 */
export function parseVitals(body, required) {
  const vitals = { systolic: null, diastolic: null, weight: null, height: null, bmi: null, bmiStatus: null, bpStatus: null };
  if (required || !isBlank(body.bp)) {
    const { systolic, diastolic } = parseBp(body.bp);
    vitals.systolic = systolic;
    vitals.diastolic = diastolic;
    vitals.bpStatus = bpStatusOf(systolic, diastolic);
  }
  if (required || !isBlank(body.weight)) vitals.weight = number(body.weight, 'Weight', 1, 500);
  if (required || !isBlank(body.height)) vitals.height = number(body.height, 'Height', 30, 300);
  if (vitals.weight !== null && vitals.height !== null) {
    const { bmi, status } = bmiOf(vitals.weight, vitals.height);
    vitals.bmi = bmi;
    vitals.bmiStatus = status;
  }
  return vitals;
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
    college: hidden ? '' : row.college,
    visitType: row.visit_type,
    visitDate: row.visit_date,
    complaint: hidden ? 'Confidential' : row.complaint,
    diagnosis: hidden ? 'Confidential' : row.diagnosis,
    notes: hidden ? '' : row.notes || '',
    bp: hidden || row.systolic == null || row.diastolic == null ? '' : `${row.systolic}/${row.diastolic}`,
    bpStatus: hidden ? '' : row.bp_status || '',
    weightKg: hidden || row.weight_kg == null ? null : Number(row.weight_kg),
    heightCm: hidden || row.height_cm == null ? null : Number(row.height_cm),
    bmi: hidden || row.bmi == null ? null : Number(row.bmi),
    bmiStatus: hidden ? '' : row.bmi_status || '',
    confidential: Number(row.confidential) === 1,
    createdByName: row.created_by_name,
    status: row.status,
    isScreened: Number(row.is_screened) === 1,
    screenedNote: hidden ? '' : row.screened_note || '',
    screenedAt: row.screened_at || null,
    doctorName: row.doctor_name || null,
    nurseName: row.nurse_name || null,
    pulseRate: hidden || row.pulse_rate == null ? null : Number(row.pulse_rate),
    initialDiagnosis: hidden ? '' : row.initial_diagnosis || '',
    externalLabsAttached: Number(row.external_labs_attached) === 1,
    sentToHospital: Number(row.sent_to_hospital) === 1,
    course: hidden ? '' : row.course || '',
    age: !hidden && row.date_of_birth ? Math.floor((Date.now() - new Date(row.date_of_birth).getTime()) / 31557600000) : null,
    actionsTaken: hidden ? '' : row.actions_taken || '',
    soapObjective: hidden ? '' : row.soap_objective || '',
    sex: hidden ? '' : row.gender || '',
    yearLevel: hidden ? '' : row.year || '',
    visitNumber: Number(row.visit_number) || 1,
    bodyTemperature: hidden || row.body_temperature == null ? null : Number(row.body_temperature),
    screenedCopyOf: row.screened_copy_of == null ? null : Number(row.screened_copy_of),
    urgent: Number(row.urgent) === 1,
    nurseNotes: hidden ? '' : row.nurse_notes || '',
    labSourceName: hidden ? '' : row.lab_source_name || '',
    labReceivedAt: hidden ? null : row.lab_received_at || null,
    labSourceLocation: hidden ? '' : row.lab_source_location || '',
    checkupResult: row.checkup_result || null,
    isScreeningCopy: row.screened_copy_of != null,
    createdAt: row.created_at
  };
}

export const SELECT_VISIT = `SELECT v.*, p.name AS patient_name, p.college, p.course, p.year, p.gender, p.date_of_birth,
                             (SELECT COUNT(*) FROM visits vc WHERE vc.patient_id = v.patient_id AND vc.screened_copy_of IS NULL AND vc.status <> 'cancelled' AND vc.id <= v.id) AS visit_number
                      FROM visits v JOIN patients p ON p.id = v.patient_id`;

export async function listVisits({ search = '', type = '', college = '', copies = '', schoolYear = '' }, actor) {
  const where = ["v.status = 'completed'"];
  // copies=exclude hides the Screening copies, so a screened checkup is not listed twice.
  if (copies === 'exclude') where.push('v.screened_copy_of IS NULL');
  const params = [];
  // schoolYear = an id or 'current' keeps one school year; empty keeps every year.
  const year = await schoolYearFilter(schoolYear);
  where.push(...year.conditions);
  params.push(...year.params);
  const term = search.trim().slice(0, 200);
  if (term) {
    where.push('(INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0)');
    params.push(term, term);
    // Stop non-doctors from finding hidden patients by searching their name.
    if (actor.role !== 'doctor') where.push('v.confidential = 0');
  }
  if (type) {
    if (!VISIT_TYPES.includes(type)) throw new HttpError(400, 'Invalid visit type.');
    where.push('v.visit_type = ?');
    params.push(type);
  }
  if (college) {
    where.push('p.college = ?');
    params.push(college.slice(0, 255));
  }
  const [rows] = await pool.execute(
    `${SELECT_VISIT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY v.visit_date DESC, v.id DESC LIMIT 200`,
    params
  );
  return rows.map(row => rowToVisit(row, actor.role));
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
    college: text(body.college, 'College', 255),
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
// Date the outside lab result was handed to the nurse. Today unless the nurse picks another day.
// It cannot be in the future or more than a year old. No lab clinic name means no lab date.
function parseLabDate(value, labSourceName) {
  if (!labSourceName) return null;
  if (isBlank(value)) return localDate();
  const date = dateText(value, 'Lab received date');
  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const oldest = `${lastYear.getFullYear()}-${String(lastYear.getMonth() + 1).padStart(2, '0')}-${String(lastYear.getDate()).padStart(2, '0')}`;
  if (date > localDate()) throw new HttpError(400, 'The lab received date cannot be in the future.');
  if (date < oldest) throw new HttpError(400, 'The lab received date cannot be more than one year ago.');
  return date;
}

// Where the outside lab clinic is. Only kept when a clinic name was entered.
function labLocationOf(body) {
  if (!text(body.labSourceName, 'Laboratory / medical center name', 200)) return '';
  return text(body.labSourceLocation, 'Laboratory location', 200);
}

// Everything the nurse types at triage. Used by both "record" and "edit".
function parseTriage(body) {
  const visitType = text(body.visitType, 'Visit type', 20, true);
  if (!VISIT_TYPES.includes(visitType)) throw new HttpError(400, 'Select a valid visit type.');
  const isConsultation = visitType === 'Consultation';
  const vitals = parseVitals(body, isConsultation);   // a Checkup may have no vitals
  const pulse = isBlank(body.pulseRate) ? null : Math.round(number(body.pulseRate, 'Pulse rate', 20, 250));
  const temperature = isBlank(body.temperature) ? null : number(body.temperature, 'Body temperature', 30, 45);
  return {
    visitType,
    visitDate: validDate(body.visitDate),
    complaint: text(body.complaint, 'Complaint', 500, isConsultation),
    vitals, pulse, temperature,
    initialDiagnosis: text(body.initialDiagnosis, 'Initial diagnosis', 200),
    nurseNotes: text(body.nurseNotes, 'Nurse notes', 2000),
    // Only the name of the outside clinic is typed. The results stay on paper, and the date is set by the system.
    labSourceName: text(body.labSourceName, 'Laboratory / medical center name', 200),
    labReceivedAt: parseLabDate(body.labReceivedAt, text(body.labSourceName, 'Laboratory / medical center name', 200)),
    labSourceLocation: labLocationOf(body),
    urgent: flag(body.urgent),
    externalLabsAttached: flag(body.externalLabsAttached)
  };
}

export async function triageVisit(body, actor) {
  const labLocation = labLocationOf(body);   // checked before anything is saved
  const visit = await recordTriage(body, actor);
  if (labLocation) {
    await pool.execute('UPDATE visits SET lab_source_location = ? WHERE id = ?', [labLocation, visit.id]);
    visit.labSourceLocation = labLocation;
  }
  return visit;
}

async function recordTriage(body, actor) {
  requireAnyRole(actor, ['nurse'], 'Only a nurse can record triage.');
  const patientId = text(body.patientId, 'Patient ID', 50, true);
  await assertPatient(patientId);
  const t = parseTriage(body);
  const v = t.vitals;
  const [result] = await pool.execute(
    `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature,
       nurse_notes, lab_source_name, lab_received_at, urgent)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,'','',0,?,?,?,'triaged',?,?,?,?,?,?,?,?,?,?)`,
    [
      patientId, t.visitType, t.visitDate, t.complaint, v.systolic, v.diastolic, v.weight, v.height,
      v.bmi, v.bmiStatus, v.bpStatus,
      actor.id, actor.name, new Date().toISOString(),
      actor.id, actor.name, t.pulse, t.initialDiagnosis, t.labSourceName ? 1 : t.externalLabsAttached, t.temperature,
      t.nurseNotes, t.labSourceName, t.labReceivedAt, t.urgent
    ]
  );
  return fetchVisit(result.insertId, actor);
}

// The nurse can correct a visit until the doctor has it; after that it is the doctor's record.
export async function updateTriage(id, body, actor) {
  requireAnyRole(actor, ['nurse'], 'Only a nurse can edit a visit that is waiting for the doctor.');
  const t = parseTriage(body);
  const v = t.vitals;
  await withTransaction(async connection => {
    const [found] = await connection.execute('SELECT status, lab_source_name, lab_received_at FROM visits WHERE id = ? FOR UPDATE', [id]);
    if (!found[0]) throw new HttpError(404, 'Visit not found.');
    if (found[0].status !== 'triaged') throw new HttpError(409, 'Only a visit that is still waiting for the doctor can be edited.');
    // Keep the original lab date unless the clinic name changed; a cleared name clears the date.
    const sameLab = t.labSourceName === found[0].lab_source_name;
    const labDate = isBlank(body.labReceivedAt) && sameLab && found[0].lab_received_at ? found[0].lab_received_at : t.labReceivedAt;
    await connection.execute(
      `UPDATE visits SET visit_type = ?, visit_date = ?, complaint = ?, systolic = ?, diastolic = ?,
         weight_kg = ?, height_cm = ?, bmi = ?, bmi_status = ?, bp_status = ?, pulse_rate = ?,
         initial_diagnosis = ?, external_labs_attached = ?, body_temperature = ?, nurse_notes = ?,
         lab_source_name = ?, lab_source_location = ?, lab_received_at = ?, urgent = ?
       WHERE id = ?`,
      [
        t.visitType, t.visitDate, t.complaint, v.systolic, v.diastolic, v.weight, v.height,
        v.bmi, v.bmiStatus, v.bpStatus, t.pulse, t.initialDiagnosis,
        t.labSourceName ? 1 : t.externalLabsAttached, t.temperature, t.nurseNotes,
        t.labSourceName, t.labSourceLocation, labDate, t.urgent, id
      ]
    );
  });
  return fetchVisit(id, actor);
}

// A visit entered by mistake is cancelled, not deleted, and only while it is still waiting.
export async function cancelVisit(id, actor) {
  requireAnyRole(actor, ['nurse'], 'Only a nurse can cancel a visit that is waiting for the doctor.');
  const [result] = await pool.execute("UPDATE visits SET status = 'cancelled' WHERE id = ? AND status = 'triaged'", [id]);
  if (!result.affectedRows) {
    await fetchVisit(id, actor);   // 404 if it does not exist
    throw new HttpError(409, 'Only a visit that is still waiting for the doctor can be cancelled.');
  }
  return fetchVisit(id, actor);
}

// OLD VERSION, no longer used. Safe to delete in the Phase 7 cleanup.
async function oldTriageVisit(body, actor) {
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
  const nurseNotes = text(body.nurseNotes, 'Nurse notes', 2000);
  // Only the name of the outside clinic is typed. The results stay on paper, and the date is set by the system.
  const labSourceName = text(body.labSourceName, 'Laboratory / medical center name', 200);
  const labReceivedAt = labSourceName ? localDate() : null;
  const urgent = flag(body.urgent);
  const rawTemp = body.temperature;
  const temperature = rawTemp === undefined || rawTemp === null || String(rawTemp).trim() === ''
    ? null
    : number(rawTemp, 'Body temperature', 30, 45);
  const [result] = await pool.execute(
    `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature,
       nurse_notes, lab_source_name, lab_received_at, urgent)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,'','',0,?,?,?,'triaged',?,?,?,?,?,?,?,?,?,?)`,
    [
      patientId, visitType, visitDate, complaint, systolic, diastolic, weight, height,
      bmi, status, bpStatusOf(systolic, diastolic),
      actor.id, actor.name, new Date().toISOString(),
      actor.id, actor.name, pulse, initialDiagnosis, labSourceName ? 1 : flag(body.externalLabsAttached), temperature,
      nurseNotes, labSourceName, labReceivedAt, urgent
    ]
  );
  return fetchVisit(result.insertId, actor);
}

// ---------- doctor queue ----------
export async function queueVisits(actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can view the exam queue.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.status = 'triaged' ORDER BY v.urgent DESC, v.visit_date ASC, v.id ASC LIMIT 200`
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
  // The doctor picks Cleared or Needs screening. Older screens only send the screening tick, so fall back to it.
  const checkupResult = isBlank(body.checkupResult) ? (wantsScreening ? 'Needs screening' : 'Cleared') : body.checkupResult;
  if (!CHECKUP_RESULTS.includes(checkupResult)) throw new HttpError(400, 'Checkup result must be Cleared or Needs screening.');

  const rxId = await withTransaction(async connection => {
    const [found] = await connection.execute(
      'SELECT id, patient_id, visit_type, status FROM visits WHERE id = ? FOR UPDATE', [id]
    );
    const visit = found[0];
    if (!visit) throw new HttpError(404, 'Visit not found.');
    if (visit.status !== 'triaged') throw new HttpError(409, 'This visit has already been completed.');
    const screen = checkupResult === 'Needs screening' && visit.visit_type === 'Checkup';
    const now = new Date().toISOString();
    // The original stays a plain Checkup; Screening gets its own copy (below).
    await connection.execute(
      `UPDATE visits SET diagnosis = ?, confidential = ?, status = 'completed', checkup_result = ?,
         doctor_id = ?, doctor_name = ?, completed_at = ?,
         soap_objective = ?, actions_taken = ?, sent_to_hospital = ?
       WHERE id = ?`,
      [
        diagnosis, confidential, visit.visit_type === 'Checkup' ? checkupResult : null, actor.id, actor.name, now,
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
       nurse_notes, lab_source_name, lab_received_at, urgent,
       screened_copy_of)
     SELECT patient_id, visit_type, visit_date, complaint, systolic, diastolic,
       weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
       created_by, created_by_name, created_at, status, nurse_id, nurse_name, doctor_id, doctor_name,
       pulse_rate, initial_diagnosis, external_labs_attached, body_temperature,
       soap_subjective, soap_objective, soap_assessment, soap_plan, actions_taken,
       sent_to_hospital, completed_at, 1, ?, ?, ?,
       nurse_notes, lab_source_name, lab_received_at, urgent, id
       FROM visits WHERE id = ?`,
    [actor.id, when, note, visitId]
  );
  // The Screening copy keeps the outside lab location of the original visit.
  await connection.execute(
    'UPDATE visits c JOIN visits o ON o.id = c.screened_copy_of SET c.lab_source_location = o.lab_source_location WHERE o.id = ?',
    [visitId]
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
    await connection.execute("UPDATE visits SET checkup_result = 'Needs screening' WHERE id = ?", [id]);
  });
  return fetchVisit(id, actor);
}

export async function screenedVisits(actor, { schoolYear = '' } = {}) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const year = await schoolYearFilter(schoolYear);
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.is_screened = 1${year.conditions.map(c => ' AND ' + c).join('')}
     ORDER BY v.screened_at DESC, v.id DESC LIMIT 200`,
    year.params
  );
  return rows.map(row => rowToVisit(row, actor.role));
}
