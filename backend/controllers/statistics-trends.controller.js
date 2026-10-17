import { getTrends } from '../services/statistics-trends.service.js';

export async function trends(req, res) {
  let data;
  try {
    data = await getTrends(req.query, req.session.user);
  } catch (error) {
    console.error('TRENDS ERROR:', error);
    if (error && error.status) throw error;
    return res.status(500).json({ error: 'TRENDS ERROR: ' + (error && error.message ? error.message : String(error)) });
  }
  res.status(200).json({ trends: data });
}