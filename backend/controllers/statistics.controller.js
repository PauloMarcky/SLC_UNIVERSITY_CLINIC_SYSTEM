import { 
  getStatisticsSummary, 
  getMorbidityReport, 
  getDemographicDistribution, 
  exportStatisticsCsv 
} from '../services/statistics.service.js';

export async function summary(req, res) {
  const data = await getStatisticsSummary(req.query, req.session.user);
  res.status(200).json({ summary: data });
}

export async function morbidity(req, res) {
  const data = await getMorbidityReport(req.query, req.session.user);
  res.status(200).json({ morbidity: data });
}

export async function distribution(req, res) {
  const data = await getDemographicDistribution(req.query, req.session.user);
  res.status(200).json({ distribution: data });
}

export async function exportCsv(req, res) {
  const csv = await exportStatisticsCsv(req.query, req.session.user);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="clinic-statistics.csv"');
  res.status(200).send(csv);
}