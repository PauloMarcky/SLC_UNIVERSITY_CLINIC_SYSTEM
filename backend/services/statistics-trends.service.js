import { pool } from '../db/pool.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';

const isBlank = v => v === undefined || v === null || String(v).trim() === '';

// Outbreak rule: at least MIN cases this week and at least RATIO times last week.
// Set OUTBREAK_MIN_CASES and OUTBREAK_RATIO in backend/.env to change it.
const MIN_THIS_WEEK = Number(process.env.OUTBREAK_MIN_CASES) || 5;
const RATIO = Number(process.env.OUTBREAK_RATIO) || 1.5;

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * BMI categories (as stored on each visit) and this-week vs last-week case counts per diagnosis.
 * BMI follows the period and department filters. The weekly counts always cover the last 14 days.
 */
export async function getTrends({ startDate, endDate, college } = {}, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');

  const bmiWhere = ["v.status = 'completed'", 'v.screened_copy_of IS NULL', 'v.bmi IS NOT NULL'];
  const bmiParams = [];
  if (!isBlank(startDate)) { bmiWhere.push('v.visit_date >= ?'); bmiParams.push(startDate); }
  if (!isBlank(endDate)) { bmiWhere.push('v.visit_date <= ?'); bmiParams.push(endDate); }
  if (!isBlank(college)) { bmiWhere.push('p.college = ?'); bmiParams.push(college); }

  const [bmiRows] = await pool.execute(
    `SELECT category, COUNT(*) AS n FROM (SELECT COALESCE(NULLIF(v.bmi_status, ''), 'Unspecified') AS category
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE ${bmiWhere.join(' AND ')}) t
      GROUP BY category
      ORDER BY n DESC`,
    bmiParams
  );

  const today = isoDaysAgo(0);
  const thisStart = isoDaysAgo(6);
  const lastStart = isoDaysAgo(13);
  const lastEnd = isoDaysAgo(7);

  const weekWhere = ["v.status = 'completed'", 'v.screened_copy_of IS NULL', "v.diagnosis <> ''",
    'v.diagnosis IS NOT NULL', 'v.visit_date >= ?', 'v.visit_date <= ?'];
  const weekParams = [thisStart, lastStart, lastEnd, lastStart, today];
  if (!isBlank(college)) { weekWhere.push('p.college = ?'); weekParams.push(college); }

  const [weekRows] = await pool.execute(
    `SELECT v.diagnosis,
            SUM(CASE WHEN v.visit_date >= ? THEN 1 ELSE 0 END) AS this_week,
            SUM(CASE WHEN v.visit_date >= ? AND v.visit_date <= ? THEN 1 ELSE 0 END) AS last_week
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE ${weekWhere.join(' AND ')}
      GROUP BY v.diagnosis`,
    weekParams
  );

  return {
    bmi: bmiRows.map(r => ({ category: r.category, count: Number(r.n) })),
    weekly: weekRows.map(r => ({ diagnosis: r.diagnosis, thisWeek: Number(r.this_week), lastWeek: Number(r.last_week) })),
    rule: { minThisWeek: MIN_THIS_WEEK, ratio: RATIO }
  };
}