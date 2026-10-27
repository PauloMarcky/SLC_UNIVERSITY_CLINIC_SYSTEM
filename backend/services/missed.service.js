import { pool } from '../db/pool.js';
import { clinicToday, daysBefore, MISSED_AFTER_DAYS } from '../utils/clinic-date.js';

/**
 * Saves every triaged visit that waited MISSED_AFTER_DAYS calendar days or more as "missed".
 * Nothing else changes: the vitals stay on the visit, it leaves the queue, and it never counts as an
 * examined visit. The window counts from the day the vitals were taken (the original date of a re-queued
 * visit), so re-queueing never keeps old vitals alive. Runs whenever the queue or a student record is opened, so no scheduled job is needed.
 * Returns how many visits were closed.
 */
export async function closeExpiredVisits(connection = pool) {
  const cutoff = daysBefore(clinicToday(), MISSED_AFTER_DAYS);   // visit_date on or before this is too old
  const [result] = await connection.execute(
    "UPDATE visits SET status = 'missed', missed_at = ? WHERE status = 'triaged' AND COALESCE(original_visit_date, visit_date) <= ?",
    [new Date().toISOString(), cutoff]
  );
  return result.affectedRows;
}
