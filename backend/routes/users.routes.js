import { Router } from '../utils/framework.js';
import { requireRole } from '../middleware/requireRole.js';
import * as users from '../controllers/users.controller.js';

// The gate is attached to each /users route, never router-wide: a router-level gate would
// also run for every other /api path that passes through this router.
const doctorOnly = requireRole(['doctor'], 'Only a doctor can manage user accounts.');

export const usersRoutes = Router()
  .get('/users', doctorOnly, users.list)
  .post('/users', doctorOnly, users.create)
  .put('/users/:id', doctorOnly, users.update)
  .delete('/users/:id', doctorOnly, users.deactivate);
