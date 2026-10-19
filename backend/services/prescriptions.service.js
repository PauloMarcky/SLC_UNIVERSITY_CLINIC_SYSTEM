import { pool } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, wholeNumber } from '../utils/validators.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';

// Keep in sync with RX_FREQUENCIES in frontend/js/rx-api.js
export const FREQUENCIES = [
  'Once daily', 'Twice daily (BID)', 'Three times daily (TID)', 'Four times daily (QID)',
  'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'At bedtime', 'As needed (PRN)', 'Single dose'
];

/** Validate the prescription part of a visit request. Returns [] when there is none. */
export function parseItems(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : raw.items;
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new HttpError(400, 'Prescription items must be a list.');
  if (list.length > 10) throw new HttpError(400, 'A prescription can have at most 10 medicines.');
  const seen = new Set();
  return list.map((item, i) => {
    const label = `Medicine ${i + 1}`;
    if (!item || typeof item !== 'object') throw new HttpError(400, `${label} is invalid.`);
    const medicine = text(item.medicine, `${label}: medicine name`, 150, true);
    const key = medicine.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, 'The same medicine is listed twice. Combine it into one line.');
    seen.add(key);
    const frequency = text(item.frequency, `${label}: frequency`, 60, true);
    if (!FREQUENCIES.includes(frequency)) throw new HttpError(400, `${label}: choose a frequency from the list.`);
    return {
      medicine,
      dose: text(item.dose, `${label}: dose`, 100, true),
      frequency,
      durationDays: wholeNumber(item.durationDays, `${label}: duration (days)`, 1, 365),
      quantity: wholeNumber(item.quantity, `${label}: quantity`, 1, 1000),
      instructions: text(item.instructions, `${label}: instructions`, 300)
    };
  });
}

/** Called inside the visit transaction, so a bad prescription cancels the whole visit. */
export async function createPrescriptionInTx(connection, { visitId, patientId, items }, actor) {
  if (!items.length) return null;
  const [res] = await connection.execute(
    `INSERT INTO prescriptions(visit_id, patient_id, status, created_by, created_by_name, created_at)
     VALUES(?,?,?,?,?,?)`,
    [visitId, patientId, 'pending', actor.id, actor.name, new Date().toISOString()]
  );
  for (const item of items) {
    await connection.execute(
      `INSERT INTO prescription_items(prescription_id, medicine_name, dose, frequency, duration_days, quantity, instructions)
       VALUES(?,?,?,?,?,?,?)`,
      [res.insertId, item.medicine, item.dose, item.frequency, item.durationDays, item.quantity, item.instructions]
    );
  }
  return res.insertId;
}

const SELECT_RX = `SELECT rx.*, v.confidential, v.visit_date, v.diagnosis, p.name AS patient_name, p.college
                   FROM prescriptions rx
                   JOIN visits v ON v.id = rx.visit_id
                   JOIN patients p ON p.id = rx.patient_id`;

async function attachItems(rows, actor) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [items] = await pool.execute(
    `SELECT id, prescription_id, medicine_name, dose, frequency, duration_days, quantity, instructions
     FROM prescription_items
     WHERE prescription_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
    ids
  );
  return rows.map(row => {
    // Same rule as visits: confidential visits are hidden from everyone but doctors.
    const hidden = Number(row.confidential) === 1 && actor.role !== 'doctor';
    return {
      id: Number(row.id),
      visitId: Number(row.visit_id),
      status: row.status,
      patientId: hidden ? null : row.patient_id,
      patientName: hidden ? 'Confidential patient' : row.patient_name,
      college: hidden ? '' : row.college,
      diagnosis: hidden ? '' : row.diagnosis,
      visitDate: row.visit_date,
      confidential: Number(row.confidential) === 1,
      prescribedBy: row.created_by_name,
      createdAt: row.created_at,
      dispensedBy: row.dispensed_by_name,
      dispensedAt: row.dispensed_at,
      cancelledReason: row.cancelled_reason,
      items: items.filter(i => Number(i.prescription_id) === Number(row.id)).map(i => ({
        id: Number(i.id), medicine: i.medicine_name,
        dose: i.dose, frequency: i.frequency, durationDays: Number(i.duration_days),
        quantity: Number(i.quantity), instructions: i.instructions
      }))
    };
  });
}

export async function getPrescription(id, actor) {
  const [rows] = await pool.execute(`${SELECT_RX} WHERE rx.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Prescription not found.');
  return (await attachItems(rows, actor))[0];
}

export async function listPrescriptions({ status = 'pending' }, actor) {
  if (!['pending', 'dispensed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const [rows] = await pool.execute(`${SELECT_RX} WHERE rx.status = ? ORDER BY rx.id DESC LIMIT 100`, [status]);
  return attachItems(rows, actor);
}

export async function listForPatient(patientId, actor) {
  const hide = actor.role === 'doctor' ? '' : 'AND v.confidential = 0';
  const [rows] = await pool.execute(
    `${SELECT_RX} WHERE rx.patient_id = ? ${hide} ORDER BY rx.id DESC LIMIT 50`, [patientId]
  );
  return attachItems(rows, actor);
}

/** Mark the prescription as handed out. There is no stock tracking any more. */
export async function dispensePrescription(id, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const [result] = await pool.execute(
    `UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_by_name = ?, dispensed_at = ?
     WHERE id = ? AND status = 'pending'`,
    [actor.id, actor.name, new Date().toISOString(), id]
  );
  if (!result.affectedRows) {
    const [rows] = await pool.execute('SELECT status FROM prescriptions WHERE id = ?', [id]);
    if (!rows[0]) throw new HttpError(404, 'Prescription not found.');
    throw new HttpError(409, `This prescription is already ${rows[0].status}.`);
  }
  return getPrescription(id, actor);
}

export async function cancelPrescription(id, body, actor) {
  if (actor.role !== 'doctor') throw new HttpError(403, 'Only a doctor can cancel a prescription.');
  const reason = text(body.reason, 'Reason', 300, true);
  const [result] = await pool.execute(
    `UPDATE prescriptions SET status = 'cancelled', cancelled_reason = ? WHERE id = ? AND status = 'pending'`,
    [reason, id]
  );
  if (!result.affectedRows) throw new HttpError(409, 'Only pending prescriptions can be cancelled.');
  return getPrescription(id, actor);
}