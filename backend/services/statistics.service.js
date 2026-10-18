import { pool } from '../db/pool.js';
import { STAFF, requireAnyRole } from '../utils/authz.js';
import { HttpError } from '../utils/http-error.js';
import { resolveSchoolYear } from './school-years.service.js';

const isBlank = v => v === undefined || v === null || String(v).trim() === '';

/**
 * View filter for the statistics page: '' (all combined), 'checkup', 'consultation' or 'screened'.
 * Returns a fixed SQL fragment (never user text), or '' for "all combined".
 * 'screened' = checkups elevated to screening (checkup_result = 'Needs screening').
 */
export function scopeCondition(scope) {
  if (isBlank(scope)) return '';
  switch (String(scope).trim().toLowerCase()) {
    case 'checkup': return "v.visit_type = 'Checkup'";
    case 'consultation': return "v.visit_type = 'Consultation'";
    case 'screened': return "v.visit_type = 'Checkup' AND v.checkup_result = 'Needs screening'";
    default: throw new HttpError(400, 'Invalid statistics view.');
  }
}

/**
 * Narrows the period to one school year (filters.schoolYear: an id or 'current'; empty = every year).
 * The school year's dates are combined with any start/end date already chosen, so "this month" inside
 * a school year still means this month. Returns the filters with startDate/endDate set.
 */
export async function narrowToSchoolYear(filters = {}) {
  const year = await resolveSchoolYear(filters.schoolYear);
  if (!year) return filters;
  const startDate = isBlank(filters.startDate) || filters.startDate < year.startDate ? year.startDate : filters.startDate;
  let endDate = filters.endDate;
  if (year.endDate && (isBlank(endDate) || endDate > year.endDate)) endDate = year.endDate;
  return { ...filters, startDate, endDate, schoolYear: '', schoolYearLabel: year.label };
}

/**
 * Returns top-level summary metrics:
 * Total visits, consultations, total checkups, healthy checkups (Cleared),
 * checkups elevated to screening (Needs screening), and unique patients seen.
 * Excludes cancelled visits and duplicate screening copies by default.
 */
export async function getStatisticsSummary(input = {}, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required for statistics.');
  const { startDate, endDate, college, scope } = await narrowToSchoolYear(input);

  const conditions = ["v.status = 'completed'", "v.screened_copy_of IS NULL"];
  const scopeSql = scopeCondition(scope);
  if (scopeSql) conditions.push(scopeSql);
  const params = [];

  if (!isBlank(startDate)) {
    conditions.push("v.visit_date >= ?");
    params.push(startDate);
  }
  if (!isBlank(endDate)) {
    conditions.push("v.visit_date <= ?");
    params.push(endDate);
  }
  if (!isBlank(college)) {
    conditions.push("p.college = ?");
    params.push(college);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT 
       COUNT(*) as total_visits,
       COUNT(DISTINCT v.patient_id) as unique_patients,
       SUM(CASE WHEN v.visit_type = 'Consultation' THEN 1 ELSE 0 END) as consultations,
       SUM(CASE WHEN v.visit_type = 'Checkup' THEN 1 ELSE 0 END) as checkups,
       SUM(CASE WHEN v.visit_type = 'Checkup' AND (v.checkup_result = 'Cleared' OR v.checkup_result IS NULL) THEN 1 ELSE 0 END) as checkups_cleared,
       SUM(CASE WHEN v.visit_type = 'Checkup' AND v.checkup_result = 'Needs screening' THEN 1 ELSE 0 END) as checkups_screened
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     ${whereClause}`,
    params
  );

  const res = rows[0] || {};
  const total = Number(res.total_visits) || 0;
  const consults = Number(res.consultations) || 0;
  const checkupsCount = Number(res.checkups) || 0;
  const cleared = Number(res.checkups_cleared) || 0;
  const screened = Number(res.checkups_screened) || 0;

  // Total screening records generated (inside the school year, when one is chosen)
  const copyWhere = ["screened_copy_of IS NOT NULL", "status <> 'cancelled'"];
  const copyParams = [];
  if (input.schoolYear) {
    if (!isBlank(startDate)) { copyWhere.push('visit_date >= ?'); copyParams.push(startDate); }
    if (!isBlank(endDate)) { copyWhere.push('visit_date <= ?'); copyParams.push(endDate); }
  }
  const [screenCopyRows] = await pool.execute(
    `SELECT COUNT(*) as screening_copies 
     FROM visits 
     WHERE ${copyWhere.join(' AND ')}`,
    copyParams
  );

  return {
    totalVisits: total,
    uniquePatients: Number(res.unique_patients) || 0,
    consultations: consults,
    checkups: checkupsCount,
    checkupOutcomes: {
      cleared,
      needsScreening: screened,
      screeningRatePct: checkupsCount > 0 ? Number(((screened / checkupsCount) * 100).toFixed(1)) : 0
    },
    totalScreeningCopies: Number(screenCopyRows[0]?.screening_copies) || 0
  };
}

/**
 * Groups all completed visits by diagnosis / illness name.
 * Ranks them by frequency and calculates morbidity percentage.
 */
export async function getMorbidityReport(input = {}, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const { startDate, endDate, college, type, scope } = await narrowToSchoolYear(input);

  const conditions = ["v.status = 'completed'", "v.screened_copy_of IS NULL", "v.diagnosis <> ''", "v.diagnosis IS NOT NULL"];
  const scopeSql = scopeCondition(scope);
  if (scopeSql) conditions.push(scopeSql);
  const params = [];

  if (!isBlank(startDate)) {
    conditions.push("v.visit_date >= ?");
    params.push(startDate);
  }
  if (!isBlank(endDate)) {
    conditions.push("v.visit_date <= ?");
    params.push(endDate);
  }
  if (!isBlank(college)) {
    conditions.push("p.college = ?");
    params.push(college);
  }
  if (!isBlank(type)) {
    conditions.push("v.visit_type = ?");
    params.push(type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [totalRows] = await pool.execute(
    `SELECT COUNT(*) as total_diagnosed 
     FROM visits v 
     JOIN patients p ON p.id = v.patient_id 
     ${whereClause}`,
    params
  );
  const totalDiagnosed = Number(totalRows[0]?.total_diagnosed) || 0;

  const [rows] = await pool.execute(
    `SELECT 
       v.diagnosis,
       COUNT(*) as case_count,
       MAX(v.visit_date) as last_seen_date
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     ${whereClause}
     GROUP BY v.diagnosis
     ORDER BY case_count DESC, v.diagnosis ASC`,
    params
  );

  const report = rows.map(r => {
    const count = Number(r.case_count);
    return {
      diagnosis: r.diagnosis,
      caseCount: count,
      percentage: totalDiagnosed > 0 ? Number(((count / totalDiagnosed) * 100).toFixed(1)) : 0,
      lastSeenDate: r.last_seen_date
    };
  });

  return {
    totalCases: totalDiagnosed,
    items: report
  };
}

/**
 * The "Dstrbtn" (Distribution) report:
 * Cross-tabulates clinical cases across Colleges, Courses, and Gender.
 */
export async function getDemographicDistribution(input = {}, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const { startDate, endDate, scope } = await narrowToSchoolYear(input);

  const conditions = ["v.status = 'completed'", "v.screened_copy_of IS NULL"];
  const scopeSql = scopeCondition(scope);
  if (scopeSql) conditions.push(scopeSql);
  const params = [];

  if (!isBlank(startDate)) {
    conditions.push("v.visit_date >= ?");
    params.push(startDate);
  }
  if (!isBlank(endDate)) {
    conditions.push("v.visit_date <= ?");
    params.push(endDate);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Distribution by College
  const [collegeRows] = await pool.execute(
    `SELECT 
       COALESCE(NULLIF(p.college, ''), 'Unspecified') as college,
       COUNT(*) as visit_count,
       SUM(CASE WHEN v.visit_type = 'Consultation' THEN 1 ELSE 0 END) as consultations,
       SUM(CASE WHEN v.visit_type = 'Checkup' THEN 1 ELSE 0 END) as checkups
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     ${whereClause}
     GROUP BY p.college
     ORDER BY visit_count DESC`,
    params
  );

  // Distribution by Gender / Sex
  const [genderRows] = await pool.execute(
    `SELECT 
       COALESCE(NULLIF(p.gender, ''), 'Unspecified') as gender,
       COUNT(*) as count
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     ${whereClause}
     GROUP BY p.gender
     ORDER BY count DESC`,
    params
  );

  // External Laboratory Report Sources
  const [labRows] = await pool.execute(
    `SELECT 
       COALESCE(NULLIF(v.lab_source_name, ''), 'Internal / None') as lab_source,
       COUNT(*) as reports_count
     FROM visits v
     ${whereClause}
     GROUP BY v.lab_source_name
     ORDER BY reports_count DESC`,
    params
  );

  return {
    byCollege: collegeRows.map(r => ({
      college: r.college,
      totalVisits: Number(r.visit_count),
      consultations: Number(r.consultations),
      checkups: Number(r.checkups)
    })),
    byGender: genderRows.map(r => ({
      gender: r.gender,
      count: Number(r.count)
    })),
    externalLabSources: labRows.map(r => ({
      sourceName: r.lab_source,
      count: Number(r.reports_count)
    }))
  };
}

/**
 * Generates formatted CSV for Excel clinic reporting.
 */
export async function exportStatisticsCsv(input, actor) {
  requireAnyRole(actor, STAFF, 'Clinic staff access required.');
  const filters = await narrowToSchoolYear(input);
  const summary = await getStatisticsSummary(filters, actor);
  const morbidity = await getMorbidityReport(filters, actor);
  const distribution = await getDemographicDistribution(filters, actor);

  const lines = [];
  lines.push('--- UNIVERSITY CLINIC HEALTH SURVEILLANCE REPORT ---');
  lines.push(`Generated At,${new Date().toISOString()}`);
  lines.push(`School Year,"${String(filters.schoolYearLabel || 'All school years').replace(/"/g, '""')}"`);
  lines.push(`Total Visits,${summary.totalVisits}`);
  lines.push(`Consultations,${summary.consultations}`);
  lines.push(`Checkups,${summary.checkups}`);
  lines.push(`Checkups Cleared,${summary.checkupOutcomes.cleared}`);
  lines.push(`Checkups Elevated to Screening,${summary.checkupOutcomes.needsScreening}`);
  lines.push('');
  lines.push('--- MORBIDITY / DIAGNOSIS RANKING ---');
  lines.push('Rank,Diagnosis,Cases,Percentage,Last Seen');
  morbidity.items.forEach((item, idx) => {
    const escapedDiagnosis = `"${item.diagnosis.replace(/"/g, '""')}"`;
    lines.push(`${idx + 1},${escapedDiagnosis},${item.caseCount},${item.percentage}%,${item.lastSeenDate || ''}`);
  });
  lines.push('');
  lines.push('--- DISTRIBUTION (DSTRBTN) BY COLLEGE ---');
  lines.push('College,Total Visits,Consultations,Checkups');
  distribution.byCollege.forEach(c => {
    lines.push(`"${c.college.replace(/"/g, '""')}",${c.totalVisits},${c.consultations},${c.checkups}`);
  });

  return lines.join('\n');
}