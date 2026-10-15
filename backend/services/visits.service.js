import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, number, validDate, flag } from '../utils/validators.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';
import { patient, assertPatient } from './patients.service.js';
import { parseItems, createPrescriptionInTx, getPrescription } from './prescriptions.service.js';

export const VISIT_TYPES = ['Consultation', 'Checkup'];
export const DIAGNOSES = [
  'URI / Flu', 'Wound', 'Neurological',
  'Mental health (anxiety, depression, panic)', 'Metabolic', 'Normal / Well'
];

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
    createdAt: row.created_at
  };
}

export const SELECT_VISIT = `SELECT v.*, p.name AS patient_name, p.college, p.course, p.year, p.gender, p.date_of_birth,
                             (SELECT COUNT(*) FROM visits vc WHERE vc.patient_id = v.patient_id AND vc.id <= v.id) AS visit_number
                      FROM visits v JOIN patients p ON p.id = v.patient_id`;

export async function listVisits({ search = '', type = '', college = '' }, actor) {
  const where = ["v.status = 'completed'"];
  const params = [];
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
    params.push(college.slice(0, 100));
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
  const diagnosis = text(body.diagnosis, 'Diagnosis category', 100, true);
  if (!DIAGNOSES.includes(diagnosis)) throw new HttpError(400, 'Select a valid diagnosis category.');
  const { systolic, diastolic } = parseBp(body.bp);
  const weight = number(body.weight, 'Weight', 1, 500);
  const height = number(body.height, 'Height', 30, 300);
  const { bmi, status } = bmiOf(weight, height);
  const visitDate = validDate(body.visitDate);
  const complaint = text(body.complaint, 'Complaint', 500, true);
  const notes = text(body.notes, 'Notes', 5000);
  const rxItems = parseItems(body.prescription);   // validated before anything is saved
  const confidential = body.confidential === true || body.confidential === 'true' ||
    diagnosis.startsWith('Mental health') ? 1 : 0;

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
  requireAnyRole(actor, ['doctor'], 'Only a doctor can view the exam queue.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.status = 'triaged' ORDER BY v.visit_date ASC, v.id ASC LIMIT 200`
  );
  return rows.map(row => rowToVisit(row, actor.role));
}

export async function completeVisit(id, body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can complete a visit.');
  const diagnosis = text(body.diagnosis, 'Diagnosis category', 100, true);
  if (!DIAGNOSES.includes(diagnosis)) throw new HttpError(400, 'Select a valid diagnosis category.');
  const soapSubjective = text(body.soapSubjective, 'Subjective', 5000);
  const soapObjective = text(body.soapObjective, 'Objective', 5000);
  const soapAssessment = text(body.soapAssessment, 'Assessment', 5000);
  const soapPlan = text(body.soapPlan, 'Plan', 5000);
  const actionsTaken = text(body.actionsTaken, 'Actions taken', 5000);
  const notes = text(body.notes, 'Notes', 5000);
  const confidential = flag(body.confidential) || diagnosis.startsWith('Mental health') ? 1 : 0;
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
    await connection.execute(
      `UPDATE visits SET diagnosis = ?, notes = ?, confidential = ?, status = 'completed',
         doctor_id = ?, doctor_name = ?, completed_at = ?,
         soap_subjective = ?, soap_objective = ?, soap_assessment = ?, soap_plan = ?, actions_taken = ?,
         sent_to_hospital = ?, is_screened = ?, screened_by = ?, screened_at = ?, screened_note = ?
       WHERE id = ?`,
      [
        diagnosis, notes, confidential,
        actor.id, actor.name, now,
        soapSubjective, soapObjective, soapAssessment, soapPlan, actionsTaken,
        flag(body.sentToHospital), screen ? 1 : 0, screen ? actor.id : null,
        screen ? now : null, screen ? screenedNote : '',
        id
      ]
    );
    return createPrescriptionInTx(
      connection, { visitId: id, patientId: visit.patient_id, items: rxItems }, actor
    );
  });
  const result = await fetchVisit(id, actor);
  result.prescription = rxId ? await getPrescription(rxId, actor) : null;
  return result;
}

// ---------- screening ----------
export async function screenVisit(id, body, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can put a checkup to screening.');
  const note = text(body.screenedNote, 'Screening note', 300);
  const [result] = await pool.execute(
    `UPDATE visits SET is_screened = 1, screened_by = ?, screened_at = ?, screened_note = ?
     WHERE id = ? AND visit_type = 'Checkup' AND status = 'completed' AND is_screened = 0`,
    [actor.id, new Date().toISOString(), note, id]
  );
  if (!result.affectedRows) {
    await fetchVisit(id, actor);
    throw new HttpError(409, 'Only a completed checkup that is not yet screened can be put to screening.');
  }
  return fetchVisit(id, actor);
}

export async function screenedVisits(actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.is_screened = 1 ORDER BY v.screened_at DESC, v.id DESC LIMIT 200`
  );
  return rows.map(row => rowToVisit(row, actor.role));
}
