import { pool } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';

export async function notify(recipients, current, message, connection) {
  const now = new Date().toISOString();
  for (const recipient of new Set(recipients)) {
    await connection.execute(
      'INSERT INTO notifications(recipient_id,certificate_id,message,created_at) VALUES(?,?,?,?)',
      [recipient, current.id, message, now]
    );
  }
}

export async function listNotifications(userId) {
  const [notifications] = await pool.execute(
    `SELECT id, message, certificate_id AS certificateId,
            created_at AS createdAt, read_at AS readAt
     FROM notifications WHERE recipient_id = ? ORDER BY id DESC LIMIT 100`,
    [userId]
  );
  return notifications;
}

export async function markNotificationRead(id, userId) {
  const [result] = await pool.execute(
    'UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_id = ?',
    [new Date().toISOString(), id, userId]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Notification not found.');
}
