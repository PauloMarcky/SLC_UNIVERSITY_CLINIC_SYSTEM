import { Router } from '../utils/framework.js';
import * as certificates from '../controllers/certificates.controller.js';

export const certificatesRoutes = Router()
  .get('/certificates', certificates.list)
  .post('/certificates', certificates.create)
  .get('/certificates/:id', certificates.get)
  .put('/certificates/:id', certificates.update)
  .post('/certificates/:id/:action', certificates.act)
  .get('/notifications', certificates.notifications)
  .post('/notifications/:id/read', certificates.readNotification);
