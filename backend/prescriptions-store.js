import { pool, withTransaction } from './db.js';
import { HttpError } from './store.js';
import { wholeNumber } from './inventory-store.js';

// Keep in sync with RX_FREQUENCIES in frontend/js/rx-api.js
export const FREQUENCIES = [
  'Once daily', 'Twice daily (BID)', 'Three times daily (TID)', 'Four times daily (QID)',
  'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'At bedtime', 'As needed (PRN)', 'Single dose'
];

function text(value, field, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return result;
}

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
    const medicineId = wholeNumber(item.medicineId, `${label}: medicine`, 1, Number.MAX_SAFE_INTEGER);
    if (seen.has(medicineId)) throw new HttpError(400, 'The same medicine is listed twice. Combine it into one line.');
    seen.add(medicineId);
    const frequency = text(item.frequency, `${label}: frequency`, 60, true);
    if (!FREQUENCIES.includes(frequency)) throw new HttpError(400, `${label}: choose a frequency from the list.`);
    return {
      medicineId,
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
  for (const item of items) {
    const [meds] = await connection.execute('SELECT name, unit FROM medicines WHERE id = ? AND active = 1', [item.medicineId]);
    if (!meds[0]) throw new HttpError(400, 'One of the medicines is not in the inventory.');
    const [stock] = await connection.execute(
      `SELECT COALESCE(SUM(quantity), 0) AS qty FROM medicine_batches
       WHERE medicine_id = ? AND expiry_date >= CURDATE()`, [item.medicineId]
    );
    if (Number(stock[0].qty) < item.quantity) {
      throw new HttpError(409, `Not enough in-date stock of ${meds[0].name}: ${Number(stock[0].qty)} ${meds[0].unit} available, ${item.quantity} requested.`);
    }
  }
  const [res] = await connection.execute(
    `INSERT INTO prescriptions(visit_id, patient_id, status, created_by, created_by_name, created_at)
     VALUES(?,?,?,?,?,?)`,
    [visitId, patientId, 'pending', actor.id, actor.name, new Date().toISOString()]
  );
  for (const item of items) {
    await connection.execute(
      `INSERT INTO prescription_items(prescription_id, medicine_id, dose, frequency, duration_days, quantity, instructions)
       VALUES(?,?,?,?,?,?,?)`,
      [res.insertId, item.medicineId, item.dose, item.frequency, item.durationDays, item.quantity, item.instructions]
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
    `SELECT i.id, i.prescription_id, i.medicine_id, i.dose, i.frequency, i.duration_days, i.quantity,
            i.instructions, m.name AS medicine_name, m.unit
     FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id
     WHERE i.prescription_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.id`,
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
        id: Number(i.id), medicineId: Number(i.medicine_id), medicine: i.medicine_name, unit: i.unit,
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

/**
 * Hand the medicine out: take stock from the earliest-expiring in-date batches (FEFO),
 * lock the rows so two people cannot dispense the same pills, and log every movement.
 * Everything is one transaction: if any line fails, nothing is deducted.
 */
export async function dispensePrescription(id, actor) {
  await withTransaction(async connection => {
    const [rxRows] = await connection.execute('SELECT * FROM prescriptions WHERE id = ? FOR UPDATE', [id]);
    const rx = rxRows[0];
    if (!rx) throw new HttpError(404, 'Prescription not found.');
    if (rx.status !== 'pending') throw new HttpError(409, `This prescription is already ${rx.status}.`);
    const [items] = await connection.execute(
      `SELECT i.id, i.medicine_id, i.quantity, m.name, m.unit
       FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id
       WHERE i.prescription_id = ? ORDER BY i.id`, [id]
    );
    const now = new Date().toISOString();
    for (const item of items) {
      let remaining = item.quantity;
      const [batches] = await connection.execute(
        `SELECT id, quantity FROM medicine_batches
         WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
         ORDER BY expiry_date ASC, id ASC FOR UPDATE`, [item.medicine_id]
      );
      for (const batch of batches) {
        if (remaining === 0) break;
        const take = Math.min(batch.quantity, remaining);
        await connection.execute('UPDATE medicine_batches SET quantity = quantity - ? WHERE id = ?', [take, batch.id]);
        await connection.execute('INSERT INTO dispense_lines(item_id, batch_id, quantity) VALUES(?,?,?)', [item.id, batch.id, take]);
        await connection.execute(
          `INSERT INTO stock_movements(batch_id, medicine_id, change_qty, reason, ref, user_id, user_name, created_at)
           VALUES(?,?,?,?,?,?,?,?)`,
          [batch.id, item.medicine_id, -take, 'dispensed', `RX-${id}`, actor.id, actor.name, now]
        );
        remaining -= take;
      }
      if (remaining > 0) {
        throw new HttpError(409, `Not enough in-date stock of ${item.name}: short by ${remaining} ${item.unit}. Nothing was dispensed.`);
      }
    }
    await connection.execute(
      `UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_by_name = ?, dispensed_at = ? WHERE id = ?`,
      [actor.id, actor.name, now, id]
    );
  });
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
