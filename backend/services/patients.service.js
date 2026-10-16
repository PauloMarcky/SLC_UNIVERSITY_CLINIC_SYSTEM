import { pool } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, optionalDate, flag } from '../utils/validators.js';
import { STAFF, requireAnyRole, checkRole } from '../utils/authz.js';

export async function patient(id, connection = pool) {
  const [rows] = await connection.execute(
    'SELECT id,name,college,course,year,category FROM patients WHERE id=?',
    [id]
  );
  return rows[0];
}

/** Search by name or ID for the patient pickers. */
export async function searchPatients(search, actor) {
  const term = (search || '').trim().slice(0, 200);
  const hideConfidential = actor && actor.role !== 'doctor' ? 'AND v.confidential = 0' : '';
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, p.college, p.course, p.year, p.category,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS date_of_birth,
            (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id ${hideConfidential}) AS last_visit
     FROM patients p
     WHERE INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0
     ORDER BY p.name, p.id LIMIT 500`,
    [term, term]
  );
  return rows.map(listedPatient);
}

function listedPatient(r) {
  return {
    id: r.id, name: r.name, college: r.college, course: r.course, year: r.year, category: r.category,
    dateOfBirth: r.date_of_birth || null,
    lastVisit: r.last_visit ? String(r.last_visit).slice(0, 10) : null
  };
}

/**
 * One page of the Student Records list. The search, the college filter and the counts all run on the
 * server, so every student can be reached by scrolling, however many there are.
 * Returns { patients, total (for this filter), all (for this search), colleges: [{ name, count }] }.
 */
export async function searchPatientsPage({ search, college, limit, offset }, actor) {
  const term = (search || '').trim().slice(0, 200);
  const chosen = (college || '').trim().slice(0, 100);
  const size = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);
  const hideConfidential = actor && actor.role !== 'doctor' ? 'AND v.confidential = 0' : '';
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, p.college, p.course, p.year, p.category,
            DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS date_of_birth,
            (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id ${hideConfidential}) AS last_visit
     FROM patients p
     WHERE (INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0)
       AND (? = '' OR p.college = ?)
     ORDER BY p.name, p.id LIMIT ${size} OFFSET ${skip}`,
    [term, term, chosen, chosen]
  );
  const [groups] = await pool.execute(
    `SELECT college, COUNT(*) AS n FROM patients p
     WHERE INSTR(LOWER(p.name), LOWER(?)) > 0 OR INSTR(LOWER(p.id), LOWER(?)) > 0
     GROUP BY college ORDER BY college`,
    [term, term]
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
  const college = text(body.college, 'College', 100);
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

export async function registerPatient(body, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const id = text(body.id, 'Patient ID', 50, true);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new HttpError(400, 'Patient ID may only contain letters, numbers, dots, dashes, and underscores.');
  }
  const f = parseIdentity(body);
  try {
    await pool.execute(
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
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A patient with this ID already exists.');
    throw error;
  }
  return { id, name: f.name, college: f.college, course: f.course, year: f.year, category: f.category };
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
    otherCondition: r.other_condition || ''
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

export async function getPatientRecord(id, actor) {
  const patientId = text(id, 'Patient ID', 50, true);
  const record = await patient(patientId);

  if (!record) throw new HttpError(404, 'Patient record not found.');

  const [visits] = await pool.execute(
    `SELECT v.id, v.visit_type, v.visit_date, v.complaint,
            v.systolic, v.diastolic, v.weight_kg, v.height_cm,
            v.bmi, v.bmi_status, v.bp_status, v.diagnosis,
            v.notes, v.confidential, v.created_by_name, v.created_at
     FROM visits v
     WHERE v.patient_id = ?
       AND (? = 'doctor' OR v.confidential = 0)
       AND v.screened_copy_of IS NULL
     ORDER BY v.visit_date DESC, v.id DESC`,
    [patientId, actor.role]
  );

  return {
    ...record,
    visits: visits.map(row => ({
      id: row.id,
      visitType: row.visit_type,
      visitDate: row.visit_date,
      complaint: Number(row.confidential) === 1 ? 'Confidential' : row.complaint,
      bp: `${row.systolic}/${row.diastolic}`,
      bpStatus: row.bp_status,
      weightKg: Number(row.weight_kg),
      heightCm: Number(row.height_cm),
      bmi: Number(row.bmi),
      bmiStatus: row.bmi_status,
      diagnosis: Number(row.confidential) === 1 ? 'Confidential' : row.diagnosis,
      notes: Number(row.confidential) === 1 ? '' : row.notes || '',
      confidential: Number(row.confidential) === 1,
      createdByName: row.created_by_name,
      createdAt: row.created_at
    }))
  };
}
