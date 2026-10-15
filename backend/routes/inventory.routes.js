import { Router } from '../utils/framework.js';
import * as inventory from '../controllers/inventory.controller.js';

export const inventoryRoutes = Router()
  .get('/medicines', inventory.medicines)
  .get('/medicines/:id/batches', inventory.batches)
  .post('/inventory/receive', inventory.receive)
  .post('/inventory/adjust', inventory.adjust)
  .get('/inventory/movements', inventory.movements)
  .get('/inventory/reorder', inventory.reorder);
