import { Router } from '../utils/framework.js';
import * as patients from '../controllers/patients.controller.js';
import * as prescriptions from '../controllers/prescriptions.controller.js';

export const patientsRoutes = Router()
  .get('/patients', patients.search)
  .post('/patients', patients.register)
  .get('/patients/:id', patients.read)
  .put('/patients/:id', patients.update)
  .get('/patients/:id/record', patients.record)
  .get('/patients/:id/history', patients.history)
  .put('/patients/:id/history', patients.updateHistory)
  .get('/patients/:id/requirements', patients.requirements)
  .put('/patients/:id/requirements', patients.updateRequirements)
  .get('/patients/:id/prescriptions', prescriptions.forPatient);
