import { pool } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { requireAnyRole } from '../utils/authz.js';
import { text, optionalDate } from '../utils/validators.js';
import { VISIT_TYPES } from './visits.service.js';

const BMI_GROUPS = ['Underweight', 'Normal', 'Overweight', 'Obese'];
const TOP_DIAGNOSES = 10;
const NO_COLLEGE = 'No department';

// Read-only counts over completed visits, for the two Statistics pages.
//   - Only completed visits count (a patient still in the Exam Queue is not a case yet).
//   - A Screening copy is the same checkup saved a second time, so copies are never counted.
//   - Doctor only for now. Before a nurse is allowed in, confidential visits must be left out
//     of every count here, and the top diagnoses must not list a confidential diagnosis.
export async function visitStatistics(query, actor) {
  requireAnyRole(actor, ['doctor'], 'Only a doctor can view statistics.');

  const type = text(query.type, 'Visit type', 20, true);
  if (!VISIT_TYPES.includes(type)) throw new HttpError(400, 'Invalid visit type.');
  const from = optionalDate(query.from, 'From date');
  const to = optionalDate(query.to, 'To date');
  if (from && to && from > to) throw new HttpError(400, 'From date must not be after the to date.');
  const college = text(query.college, 'Department', 100);

  // visit_date holds YYYY-MM-DD text, so comparing the text compares the dates. "to" is included.
  const base = ["v.status = 'completed'", 'v.visit_type = ?', 'v.screened_copy_of IS NULL'];
  const baseParams = [type];
  if (from) { base.push('v.visit_date >= ?'); baseParams.push(from); }
  if (to) { base.push('v.visit_date <= ?'); baseParams.push(to); }

  const whereOf = (extra = []) => 'WHERE ' + [...base, ...extra].join(' AND ');
  const FROM = 'FROM visits v JOIN patients p ON p.id = v.patient_id';
  const run = async (sql, params) => (await pool.execute(sql, params))[0];

  // Everything except the per-department list follows the chosen department.
  const picked = college ? ['p.college = ?'] : [];
  const pickedParams = college ? [...baseParams, college] : baseParams;
  const where = whereOf(picked);

  const [summary] = await run(
    `SELECT COUNT(*) AS total, AVG(v.bmi) AS avg_bmi,
            SUM(v.sent_to_hospital = 1) AS hospital,
            COUNT(DISTINCT NULLIF(LOWER(TRIM(v.diagnosis)), '')) AS distinct_diagnoses
     ${FROM} ${where}`, pickedParams);
  const total = Number(summary.total);

  // The department list ignores the department filter, so the chosen one is shown next to the others.
  const collegeLabel = "COALESCE(NULLIF(TRIM(p.college), ''), ?)";
  const byCollege = (await run(
    `SELECT ${collegeLabel} AS label, COUNT(*) AS n ${FROM} ${whereOf()}
     GROUP BY label ORDER BY n DESC, label ASC`, [NO_COLLEGE, ...baseParams]
  )).map(r => ({ label: r.label, count: Number(r.n) }));

  // Departments to offer in the filter: every department with a completed visit of this type, any date.
  const colleges = (await run(
    `SELECT DISTINCT TRIM(p.college) AS college ${FROM}
     WHERE v.status = 'completed' AND v.visit_type = ? AND v.screened_copy_of IS NULL
       AND TRIM(COALESCE(p.college, '')) <> '' ORDER BY college ASC`, [type]
  )).map(r => r.college);

  const result = {
    type, from, to, college,
    total,
    sentToHospital: Number(summary.hospital) || 0,
    byCollege,
    colleges
  };

  if (type === 'Checkup') {
    result.averageBmi = total && summary.avg_bmi !== null ? Math.round(Number(summary.avg_bmi) * 10) / 10 : null;
    const rows = await run(`SELECT v.bmi_status AS label, COUNT(*) AS n ${FROM} ${where} GROUP BY v.bmi_status`, pickedParams);
    const counts = new Map(rows.map(r => [r.label, Number(r.n)]));
    result.bmi = BMI_GROUPS.map(label => ({ label, count: counts.get(label) || 0 }));
  } else {
    // Diagnosis is free text, so only identical wording (ignoring case and extra spaces) is counted together.
    const rows = await run(
      `SELECT MIN(TRIM(v.diagnosis)) AS label, COUNT(*) AS n ${FROM}
       ${whereOf([...picked, "TRIM(v.diagnosis) <> ''"])}
       GROUP BY LOWER(TRIM(v.diagnosis)) ORDER BY n DESC, label ASC LIMIT ${TOP_DIAGNOSES}`, pickedParams);
    result.topDiagnoses = rows.map(r => ({ label: r.label, count: Number(r.n) }));
    result.distinctDiagnoses = Number(summary.distinct_diagnoses) || 0;
  }
  return result;
}
