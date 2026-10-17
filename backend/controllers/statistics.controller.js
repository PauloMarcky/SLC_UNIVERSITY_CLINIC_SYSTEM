import { visitStatistics } from '../services/statistics.service.js';

export async function visits(req, res) {
  res.status(200).json(await visitStatistics(req.query, req.session.user));
}
