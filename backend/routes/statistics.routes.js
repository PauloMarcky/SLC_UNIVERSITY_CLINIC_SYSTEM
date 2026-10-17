import { Router } from '../utils/framework.js';
import { requireRole } from '../middleware/requireRole.js';
import * as statistics from '../controllers/statistics.controller.js';

export const statisticsRoutes = Router()
  .get('/statistics', requireRole(['doctor'], 'Only a doctor can view statistics.'), statistics.visits);
