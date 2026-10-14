import { pool } from '../db.js';
import { HttpError } from '../store.js';

export async function getPatients(req, res, next) {
  try {
    if (!req.session) throw new HttpError(401, 'Authentication required.');
    const [rows] = await pool.execute(
      'SELECT * FROM patients ORDER BY last_name ASC, first_name ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createPatient(req, res, next) {
  try {
    if (!req.session) throw new HttpError(401, 'Authentication required.');
    if (!['nurse', 'doctor'].includes(req.session.user.role)) {
      throw new HttpError(403, 'Clinic staff access required.');
    }
    const {
      id,
      last_name,
      first_name,
      middle_name,
      department,
      contact_number,
      gender,
      date_of_birth,
      age,
      status,
      nationality,
      address,
      guardian_name,
      guardian_contact
    } = req.body || {};

    if (!id || !last_name || !first_name || !address) {
      throw new HttpError(400, 'Patient ID, last name, first name, and address are required.');
    }

    await pool.execute(
      `INSERT INTO patients (
         id, last_name, first_name, middle_name, department, contact_number, 
         gender, date_of_birth, age, status, nationality, address, 
         guardian_name, guardian_contact, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id.trim(),
        last_name.trim(),
        first_name.trim(),
        middle_name?.trim() || '',
        department?.trim() || '',
        contact_number?.trim() || '',
        gender || 'Male',
        date_of_birth?.trim() || '',
        parseInt(age, 10) || 0,
        status || 'Single',
        nationality?.trim() || 'Filipino',
        address.trim(),
        guardian_name?.trim() || '',
        guardian_contact?.trim() || ''
      ]
    );
    res.status(201).json({ ok: true, id: id.trim() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new HttpError(409, 'A patient with this ID already exists.'));
    }
    next(err);
  }
}