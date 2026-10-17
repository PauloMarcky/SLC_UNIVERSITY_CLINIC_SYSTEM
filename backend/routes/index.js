import { Router } from '../utils/framework.js';
import { HttpError } from '../utils/http-error.js';
import { attachSession, requireLogin, requireStaff } from '../middleware/session.js';
import { originCheck, csrfProtection } from '../middleware/csrf.js';
import { login } from '../controllers/auth.controller.js';
import { authRoutes } from './auth.routes.js';
import { usersRoutes } from './users.routes.js';
import { patientsRoutes } from './patients.routes.js';
import { visitsRoutes } from './visits.routes.js';
import { certificatesRoutes } from './certificates.routes.js';
import { inventoryRoutes } from './inventory.routes.js';
import { prescriptionsRoutes } from './prescriptions.routes.js';
import { statisticsRoutes } from './statistics.routes.js';

/**
 * Everything under /api. The order is the security model:
 *   1. find the session   2. login (origin check + rate limit)   3. must be logged in
 *   4. CSRF on changes    5. session/logout (any role)           6. clinic staff only
 *   7. feature routes     8. unknown /api path -> 404 JSON
 */
export function createApiRouter({ allowedOrigin, loginLimiter }) {
  return Router()
    .use(attachSession)
    .post('/login', originCheck(allowedOrigin), loginLimiter, login)
    .use(requireLogin)
    .use(csrfProtection(allowedOrigin))
    .use(authRoutes)
    .use(requireStaff)
    .use(usersRoutes)
    .use(patientsRoutes)
    .use(visitsRoutes)
    .use(inventoryRoutes)
    .use(prescriptionsRoutes)
    .use(certificatesRoutes)
    .use(statisticsRoutes)
    .use(() => { throw new HttpError(404, 'API endpoint not found.'); });
}
