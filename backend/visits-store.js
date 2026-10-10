import { pool, withTransaction } from './db.js';
import { HttpError, patient } from './store.js';

console.log('visits-store: auto patient ID version loaded');

const VISIT_TYPES = ['Consultation', 'Checkup'];
const DIAGNOSES = [
  'URI / Flu', 'Wound', 'Neurological',
  'Mental health (anxiety, depression, panic)', 'Metabolic', 'Normal / Well'
];

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
  if (systolic >= 130 || diastolic >= 85) return 'Hypertension Stage 1';
  if (systolic >= 120 || diastolic >= 80) return 'Elevated';
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
    createdAt: row.created_at
  };
}

const SELECT_VISIT = `SELECT v.*, p.name AS patient_name, p.college
                      FROM visits v JOIN patients p ON p.id = v.patient_id`;

async function listVisits({ search = '', type = '', college = '' }, actor) {
  const where = [];
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

// Next free patient ID: students get YYYY-00001, 2026-00002 ...; employees get EMP-00001 ...
async function nextPatientId(category, connection) {
  const prefix = category === 'employee' ? 'EMP' : String(new Date().getFullYear());
  const [rows] = await connection.execute(
    'SELECT id FROM patients WHERE id REGEXP ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
    [`^${prefix}-[0-9]{5}$`]
  );
  const last = rows[0] ? Number(rows[0].id.split('-')[1]) : 0;
  return `${prefix}-${String(last + 1).padStart(5, '0')}`;
}

async function createVisit(body, actor) {
  if (actor.role !== 'doctor') throw new HttpError(403, 'Only a doctor can record a visit.');
  const givenPatientId = text(body.patientId, 'Patient ID', 50);
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
  const confidential = body.confidential === true || body.confidential === 'true' ||
    diagnosis.startsWith('Mental health') ? 1 : 0;

  // Patient details are only used when this patient is not in the database yet.
  const newPatient = {
    name: text(body.patientName, 'Patient name', 200),
    college: text(body.college, 'College', 100),
    course: text(body.course, 'Course', 100),
    year: text(body.year, 'Year', 20),
    category: body.category === 'employee' ? 'employee' : 'student'
  };

  const visitId = await withTransaction(async connection => {
    let patientId = givenPatientId;
    // No ID typed (or an ID not in the database yet): add the patient automatically.
    if (!patientId || !(await patient(patientId, connection))) {
      if (!newPatient.name) throw new HttpError(400, 'Patient name is required for a new patient.');
      if (!patientId) patientId = await nextPatientId(newPatient.category, connection);
      await connection.execute(
        'INSERT INTO patients(id, name, college, course, year, category) VALUES(?,?,?,?,?,?)',
        [patientId, newPatient.name, newPatient.college, newPatient.course, newPatient.year, newPatient.category]
      );
    }
    const [result] = await connection.execute(
      `INSERT INTO visits(patient_id, visit_type, visit_date, complaint, systolic, diastolic,
         weight_kg, height_cm, bmi, bmi_status, bp_status, diagnosis, notes, confidential,
         created_by, created_by_name, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        patientId, visitType, visitDate, complaint, systolic, diastolic, weight, height,
        bmi, status, bpStatusOf(systolic, diastolic), diagnosis, notes, confidential,
        actor.id, actor.name, new Date().toISOString()
      ]
    );
    return result.insertId;
  });
  const [rows] = await pool.execute(`${SELECT_VISIT} WHERE v.id = ?`, [visitId]);
  return rowToVisit(rows[0], actor.role);
}

export { listVisits, createVisit };