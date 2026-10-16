import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text, wholeNumber, dateText } from '../utils/validators.js';

export const NEAR_EXPIRY_DAYS = 60;
export const ADJUST_REASONS = ['damaged', 'lost', 'expired_disposal', 'correction'];
const REMOVE_ONLY = ['damaged', 'lost', 'expired_disposal'];

async function today(connection = pool) {
  const [rows] = await connection.execute(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d`);
  return rows[0].d;
}

function daysUntil(dateStr, todayStr) {
  return Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 86400000);
}

/** OUT / EXPIRED / LOW / EXPIRING / OK, using in-date stock only. */
export function statusOf({ stock, expiredQty, reorderLevel, nextExpiry }, todayStr) {
  if (stock === 0 && expiredQty > 0) return 'EXPIRED';
  if (stock === 0) return 'OUT';
  if (stock <= reorderLevel) return 'LOW';
  if (nextExpiry && daysUntil(nextExpiry, todayStr) <= NEAR_EXPIRY_DAYS) return 'EXPIRING';
  return 'OK';
}

export async function listMedicines({ search = '', category = '', status = '' } = {}) {
  const where = ['m.active = 1'];
  const params = [];
  const term = search.trim().slice(0, 100);
  if (term) { where.push('INSTR(LOWER(m.name), LOWER(?)) > 0'); params.push(term); }
  if (category) { where.push('m.category = ?'); params.push(category.slice(0, 80)); }
  const [rows] = await pool.execute(
    `SELECT m.id, m.name, m.category, m.unit, m.reorder_level,
            COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity ELSE 0 END), 0) AS stock,
            COALESCE(SUM(CASE WHEN b.expiry_date <  CURDATE() THEN b.quantity ELSE 0 END), 0) AS expired_qty,
            DATE_FORMAT(MIN(CASE WHEN b.expiry_date >= CURDATE() AND b.quantity > 0 THEN b.expiry_date END), '%Y-%m-%d') AS next_expiry
     FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.id
     WHERE ${where.join(' AND ')}
     GROUP BY m.id, m.name, m.category, m.unit, m.reorder_level
     ORDER BY m.name`,
    params
  );
  const todayStr = await today();
  const list = rows.map(r => {
    const item = {
      id: Number(r.id), name: r.name, category: r.category, unit: r.unit,
      reorderLevel: Number(r.reorder_level), stock: Number(r.stock),
      expiredQty: Number(r.expired_qty), nextExpiry: r.next_expiry || null
    };
    item.status = statusOf(item, todayStr);
    item.daysToExpiry = item.nextExpiry ? daysUntil(item.nextExpiry, todayStr) : null;
    return item;
  });
  return status ? list.filter(m => m.status === status.toUpperCase()) : list;
}

export async function listBatches(medicineId) {
  const [rows] = await pool.execute(
    `SELECT id, lot_no, quantity, supplier,
            DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date,
            DATE_FORMAT(date_received, '%Y-%m-%d') AS date_received
     FROM medicine_batches WHERE medicine_id = ? ORDER BY expiry_date, id`,
    [medicineId]
  );
  const todayStr = await today();
  return rows.map(r => ({
    id: Number(r.id), lotNo: r.lot_no, quantity: Number(r.quantity), supplier: r.supplier,
    expiryDate: r.expiry_date, dateReceived: r.date_received,
    expired: r.expiry_date < todayStr,
    daysToExpiry: daysUntil(r.expiry_date, todayStr)
  }));
}

/** Stock in. Either an existing medicineId, or newMedicine {name, category, unit, reorderLevel}. */
export async function receiveStock(body, actor) {
  const lotNo = text(body.lotNo, 'Lot number', 60, true);
  const quantity = wholeNumber(body.quantity, 'Quantity', 1, 1000000);
  const expiryDate = dateText(body.expiryDate, 'Expiry date');
  const supplier = text(body.supplier, 'Supplier', 150);
  const receivedDate = body.dateReceived ? dateText(body.dateReceived, 'Date received') : null;
  const now = new Date().toISOString();

  return withTransaction(async connection => {
    const todayStr = await today(connection);
    if (expiryDate < todayStr) throw new HttpError(400, 'This stock is already expired and cannot be received.');
    let medicineId;
    if (body.newMedicine) {
      const m = body.newMedicine;
      const name = text(m.name, 'Medicine name', 150, true);
      const [dup] = await connection.execute('SELECT id FROM medicines WHERE LOWER(name) = LOWER(?)', [name]);
      if (dup[0]) throw new HttpError(409, 'A medicine with this name already exists. Pick it from the list.');
      const [res] = await connection.execute(
        'INSERT INTO medicines(name, category, unit, reorder_level, created_at) VALUES(?,?,?,?,?)',
        [name, text(m.category, 'Category', 80), text(m.unit, 'Unit', 20, true) , wholeNumber(m.reorderLevel ?? 0, 'Reorder level', 0, 1000000), now]
      );
      medicineId = res.insertId;
    } else {
      medicineId = wholeNumber(body.medicineId, 'Medicine', 1, Number.MAX_SAFE_INTEGER);
      const [found] = await connection.execute('SELECT id FROM medicines WHERE id = ? AND active = 1', [medicineId]);
      if (!found[0]) throw new HttpError(404, 'Medicine not found.');
    }
    // Same medicine + lot + expiry arriving again is the same batch: top it up.
    const [same] = await connection.execute(
      `SELECT id FROM medicine_batches WHERE medicine_id = ? AND lot_no = ? AND expiry_date = ? FOR UPDATE`,
      [medicineId, lotNo, expiryDate]
    );
    let batchId;
    if (same[0]) {
      batchId = same[0].id;
      await connection.execute('UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?', [quantity, batchId]);
    } else {
      const [res] = await connection.execute(
        `INSERT INTO medicine_batches(medicine_id, lot_no, quantity, expiry_date, supplier, date_received, created_at)
         VALUES(?,?,?,?,?,?,?)`,
        [medicineId, lotNo, quantity, expiryDate, supplier, receivedDate || todayStr, now]
      );
      batchId = res.insertId;
    }
    await connection.execute(
      `INSERT INTO stock_movements(batch_id, medicine_id, change_qty, reason, ref, user_id, user_name, created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [batchId, medicineId, quantity, 'received', supplier, actor.id, actor.name, now]
    );
    return { medicineId: Number(medicineId), batchId: Number(batchId) };
  });
}

/** Damaged / lost / disposal remove stock (send a positive number); correction is signed. */
export async function adjustStock(body, actor) {
  const batchId = wholeNumber(body.batchId, 'Batch', 1, Number.MAX_SAFE_INTEGER);
  const reason = text(body.reason, 'Reason', 30, true);
  if (!ADJUST_REASONS.includes(reason)) throw new HttpError(400, 'Choose a valid reason.');
  let change = wholeNumber(body.change, 'Quantity', -1000000, 1000000);
  if (change === 0) throw new HttpError(400, 'Quantity cannot be zero.');
  if (REMOVE_ONLY.includes(reason)) change = -Math.abs(change);
  const remark = text(body.remark, 'Remark', 60);
  if (reason === 'correction' && !remark) throw new HttpError(400, 'Add a short remark for a count correction.');

  return withTransaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT id, medicine_id, quantity FROM medicine_batches WHERE id = ? FOR UPDATE', [batchId]
    );
    const batch = rows[0];
    if (!batch) throw new HttpError(404, 'Batch not found.');
    if (batch.quantity + change < 0) {
      throw new HttpError(409, `Only ${batch.quantity} left in this batch.`);
    }
    await connection.execute('UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?', [change, batchId]);
    await connection.execute(
      `INSERT INTO stock_movements(batch_id, medicine_id, change_qty, reason, ref, user_id, user_name, created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [batchId, batch.medicine_id, change, reason, remark, actor.id, actor.name, new Date().toISOString()]
    );
    return { batchId, quantity: batch.quantity + change };
  });
}

export async function listMovements({ medicineId = null } = {}) {
  const params = [];
  let where = '';
  if (medicineId) { where = 'WHERE s.medicine_id = ?'; params.push(medicineId); }
  const [rows] = await pool.execute(
    `SELECT s.id, s.change_qty, s.reason, s.ref, s.user_name, s.created_at,
            m.name AS medicine_name, b.lot_no
     FROM stock_movements s
     JOIN medicines m ON m.id = s.medicine_id
     JOIN medicine_batches b ON b.id = s.batch_id
     ${where} ORDER BY s.id DESC LIMIT 200`,
    params
  );
  return rows.map(r => ({
    id: Number(r.id), change: Number(r.change_qty), reason: r.reason, ref: r.ref,
    userName: r.user_name, createdAt: r.created_at, medicineName: r.medicine_name, lotNo: r.lot_no
  }));
}

/** Requisition list: anything low, out, or fully expired, with a suggested order size. */
export async function reorderList() {
  const meds = await listMedicines();
  return meds
    .filter(m => ['LOW', 'OUT', 'EXPIRED'].includes(m.status))
    .map(m => ({ ...m, suggestedOrder: Math.max(m.reorderLevel * 2 - m.stock, 0) }));
}
