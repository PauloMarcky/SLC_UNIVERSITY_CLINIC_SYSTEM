import { pool, withTransaction } from './db.js';
import { HttpError, patient } from './store.js';
import { parseItems, createPrescriptionInTx, getPrescription } from './prescriptions-store.js';

const VISIT_TYPES = ['Consultation', 'Checkup'];

function text(value, field, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return result;
}

function number(value, field, min, max) {
  const result = typeof value === 'string' && !value.trim() ? NaN : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new HttpError(400, `${field} must be a number from ${min} to ${max}.`);
  }
  return result;
}

function validDate(value) {
  const date = text(value, 'Visit date', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, 'Enter a valid visit date.');
  }
  return date;
}

function parseBp(value) {
  const match = /^(\d{2,3})\/(\d{2,3})$/.exec(text(value, 'Blood pressure', 10, true));
  if (!match) throw new HttpError(400, 'Blood pressure must look like 120/80.');
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 160 || systolic <= diastolic) {
    throw new HttpError(400, 'Enter a realistic blood pressure, such as 120/80.');
  }
  return { systolic, diastolic };
}

function bmiOf(weightKg, heightCm) {
  const meters = heightCm / 100;
  const bmi = Math.round((weightKg / (meters * meters)) * 10) / 10;
  const status = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  return { bmi, status };
}

function bpStatusOf(systolic, diastolic) {
  if (systolic >= 140 || diastolic >= 90) return 'Hypertension Stage 2';
  if (systolic >= 130 || diastolic >= 80) return 'Hypertension Stage 1';
  if (systolic >= 120) return 'Elevated';
  return 'Normal';
}

// Confidential visits are hidden from everyone except doctors.
function rowToVisit(row, role) {
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

const SELECT_VISIT = `SELECT v.*, p.name AS patient_name, p.college, p.course, p.year, p.gender, p.date_of_birth,
                             (SELECT COUNT(*) FROM visits vc WHERE vc.patient_id = v.patient_id AND vc.id <= v.id) AS visit_number
                      FROM visits v JOIN patients p ON p.id = v.patient_id`;

async function listVisits({ search = '', type = '', college = '' }, actor) {
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

async function createVisit(body, actor) {
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

export {
  listVisits, createVisit,
  text, number, validDate, parseBp, bmiOf, bpStatusOf,
  rowToVisit, SELECT_VISIT, VISIT_TYPES
};