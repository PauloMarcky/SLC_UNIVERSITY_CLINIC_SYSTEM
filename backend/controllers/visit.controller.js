import { pool } from '../config/db.js';
import { HttpError } from '../stores/store.js';

export async function getVisits(req, res, next) {
  try {
    if (!req.session) throw new HttpError(401, 'Authentication required.');
    const [rows] = await pool.execute(
      `SELECT v.*, p.first_name, p.last_name, p.department 
       FROM visits v 
       JOIN patients p ON v.patient_id = p.id 
       ORDER BY v.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createVisit(req, res, next) {
  try {
    if (!req.session) throw new HttpError(401, 'Authentication required.');
    if (!['nurse', 'doctor'].includes(req.session.user.role)) {
      throw new HttpError(403, 'Clinic staff access required.');
    }

    const {
      patient_id,
      visit_type,
      medical_history,
      vitals,
      clinical_notes,
      screening_flag
    } = req.body || {};

    if (!patient_id) {
      throw new HttpError(400, 'Patient ID is required.');
    }

    const [result] = await pool.execute(
      `INSERT INTO visits (
         patient_id, staff_id, visit_type, medical_history, vitals, 
         clinical_notes, screening_flag, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        patient_id.trim(),
        req.session.user.id,
        visit_type || 'Consultation',
        JSON.stringify(medical_history || {}),
        JSON.stringify(vitals || {}),
        JSON.stringify(clinical_notes || {}),
        screening_flag ? 1 : 0
      ]
    );

    res.status(201).json({ ok: true, visitId: result.insertId });
  } catch (err) {
    next(err);
  }
}