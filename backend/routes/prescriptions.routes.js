import { Router } from '../utils/framework.js';
import * as prescriptions from '../controllers/prescriptions.controller.js';

export const prescriptionsRoutes = Router()
  .get('/prescriptions', prescriptions.list)
  .post('/prescriptions/:id/dispense', prescriptions.dispense)
  .post('/prescriptions/:id/cancel', prescriptions.cancel);
