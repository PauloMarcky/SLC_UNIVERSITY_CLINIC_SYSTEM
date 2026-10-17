import { Router } from '../utils/framework.js';
import * as statistics from '../controllers/statistics.controller.js';
import * as trends from '../controllers/statistics-trends.controller.js';

export const statisticsRoutes = Router()
  .get('/statistics/summary', statistics.summary)
  .get('/statistics/morbidity', statistics.morbidity)
  .get('/statistics/distribution', statistics.distribution)
  .get('/statistics/trends', trends.trends)
  .get('/statistics/export', statistics.exportCsv);