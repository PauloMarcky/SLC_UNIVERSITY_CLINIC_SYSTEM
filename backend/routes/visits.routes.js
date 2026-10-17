import { Router } from '../utils/framework.js';
import * as visits from '../controllers/visits.controller.js';

// Fixed paths (triage, queue, screened) come before /visits/:id/... so they are never mistaken for an id.
export const visitsRoutes = Router()
  .post('/visits/triage', visits.triage)
  .get('/visits/queue', visits.queue)
  .get('/visits/screened', visits.screened)
  .post('/visits/:id/complete', visits.complete)
  .post('/visits/:id/screen', visits.screen)
  .post('/visits/:id/cancel', visits.cancel)
  .put('/visits/:id', visits.update)
  .get('/visits', visits.list)
  .post('/visits', visits.create);
