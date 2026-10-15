import { pool, withTransaction } from './db.js';
import { HttpError } from './store.js';
import { parseItems, createPrescriptionInTx, getPrescription } from './prescriptions-store.js';
import {
  text, number, validDate, parseBp, bmiOf, bpStatusOf,
  rowToVisit, SELECT_VISIT, VISIT_TYPES, DIAGNOSES
} from './visits-store.js';

const STAFF = ['nurse', 'doctor'];

function requireRole(actor, roles, message) {
  if (!roles.includes(actor.role)) throw new HttpError(403, message);
}

function flag(value) {
  return value === true || value === 'true' ? 1 : 0;
}

function optionalDate(value, field) {
  const date = text(value, field, 10);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, `Enter a valid ${field.toLowerCase()}.`);
  }
  return date;
}

async function assertPatient(patientId) {
  const [rows] = await pool.execute('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!rows[0]) throw new HttpError(404, 'Patient not found.');
}

async function fetchVisit(id, actor) {
  const [rows] = await pool.execute(`${SELECT_VISIT} WHERE v.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Visit not found.');
  return rowToVisit(rows[0], actor.role);
}

// ---------- patients ----------
async function registerPatient(body, actor) {
  requireRole(actor, STAFF, 'Clinic staff access required.');
  const id = text(body.id, 'Patient ID', 50, true);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new HttpError(400, 'Patient ID may only contain letters, numbers, dots, dashes, and underscores.');
  }
  const lastName = text(body.lastName, 'Last name', 100, true);
  const firstName = text(body.firstName, 'First name', 100, true);
  const middleName = text(body.middleName, 'Middle name', 100);
  const gender = text(body.gender, 'Gender', 10);
  if (gender && !['Male', 'Female'].includes(gender)) throw new HttpError(400, 'Select a valid gender.');
  const dateOfBirth = optionalDate(body.dateOfBirth, 'Date of birth');
  const category = body.category === 'employee' ? 'employee' : 'student';
  const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
  if (name.length > 200) throw new HttpError(400, 'Patient name is too long.');
  const college = text(body.college, 'College', 100);
  const course = text(body.course, 'Course', 100);
  const year = text(body.year, 'Year', 20);
  try {
    await pool.execute(
      `INSERT INTO patients(id, name, college, course, year, category, last_name, first_name,
         middle_name, gender, date_of_birth, civil_status, contact_number, address,
         guardian_name, guardian_contact)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, name, college, course, year, category, lastName, firstName,
        middleName, gender || null, dateOfBirth,
        text(body.civilStatus, 'Civil status', 20),
        text(body.contactNumber, 'Contact number', 30),
        text(body.address, 'Address', 300),
        text(body.guardianName, 'Guardian name', 200),
        text(body.guardianContact, 'Guardian contact', 30)
      ]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A patient with this ID already exists.');
    throw error;
  }
  return { id, name, college, course, year, category };
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
    otherCondition: r.other_condition || ''
  };
}

async function getHistory(patientId) {
  await assertPatient(patientId);
  const [rows] = await pool.execute('SELECT * FROM patient_medical_history WHERE patient_id = ?', [patientId]);
  return historyOf(rows[0]);
}

async function saveHistory(patientId, body, actor) {
  requireRole(actor, STAFF, 'Clinic staff access required.');
  await assertPatient(patientId);
  await pool.execute(
    `INSERT INTO patient_medical_history(patient_id, asthma, allergy, allergy_details,
       febrile_convulsion, fainting_spell, epilepsy, vaccines, other_condition, updated_at, updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE asthma = VALUES(asthma), allergy = VALUES(allergy),
       allergy_details = VALUES(allergy_details), febrile_convulsion = VALUES(febrile_convulsion),
       fainting_spell = VALUES(fainting_spell), epilepsy = VALUES(epilepsy),
       vaccines = VALUES(vaccines), other_condition = VALUES(other_condition),
       updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [
      patientId, flag(body.asthma), flag(body.allergy),
      text(body.allergyDetails, 'Allergy details', 300),
      flag(body.febrileConvulsion), flag(body.faintingSpell), flag(body.epilepsy),
      text(body.vaccines, 'Vaccines', 300),
      text(body.otherCondition, 'Other condition', 300),
      new Date().toISOString(), actor.id
    ]
  );
  return getHistory(patientId);
}

// ---------- nurse triage ----------
async function triageVisit(body, actor) {
  requireRole(actor, ['nurse'], 'Only a nurse can record triage.');
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
async function queueVisits(actor) {
  requireRole(actor, ['doctor'], 'Only a doctor can view the exam queue.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.status = 'triaged' ORDER BY v.visit_date ASC, v.id ASC LIMIT 200`
  );
  return rows.map(row => rowToVisit(row, actor.role));
}

async function completeVisit(id, body, actor) {
  requireRole(actor, ['doctor'], 'Only a doctor can complete a visit.');
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
async function screenVisit(id, body, actor) {
  requireRole(actor, ['doctor'], 'Only a doctor can put a checkup to screening.');
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

async function screenedVisits(actor) {
  requireRole(actor, STAFF, 'Clinic staff access required.');
  const [rows] = await pool.execute(
    `${SELECT_VISIT} WHERE v.is_screened = 1 ORDER BY v.screened_at DESC, v.id DESC LIMIT 200`
  );
  return rows.map(row => rowToVisit(row, actor.role));
}

export {
  registerPatient, getHistory, saveHistory,
  triageVisit, queueVisits, completeVisit, screenVisit, screenedVisits
};