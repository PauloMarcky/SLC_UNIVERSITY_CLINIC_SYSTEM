import { Router } from '../utils/framework.js';
import { requireRole } from '../middleware/requireRole.js';
import * as schoolYears from '../controllers/school-years.controller.js';

// Nurses and doctors can read the list (for the School year filters); only a doctor can change it.
// The gate is attached to each route, never router-wide (see users.routes.js).
const doctorOnly = requireRole(['doctor'], 'Only a doctor can manage school years.');

export const schoolYearsRoutes = Router()
  .get('/school-years', schoolYears.list)
  .post('/school-years', doctorOnly, schoolYears.create)
  .put('/school-years/:id', doctorOnly, schoolYears.update)
  .delete('/school-years/:id', doctorOnly, schoolYears.remove);
