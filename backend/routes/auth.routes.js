import { Router } from '../utils/framework.js';
import * as auth from '../controllers/auth.controller.js';

/** Session routes. Login is wired separately in routes/index.js because it runs before the login gate. */
export const authRoutes = Router()
  .get('/session', auth.session)
  .post('/logout', auth.logout);
