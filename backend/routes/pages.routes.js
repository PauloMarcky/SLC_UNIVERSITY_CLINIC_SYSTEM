import { Router } from '../utils/framework.js';
import { attachSession, requireLogin, requireStaff } from '../middleware/session.js';
import { certificatePage, prescriptionPage } from '../controllers/pages.controller.js';

/** Printable HTML (not under /api). Same login and staff checks as the API. */
export const pagesRoutes = Router()
  .get('/certificates/:id/print', attachSession, requireLogin, requireStaff, certificatePage(true))
  .get('/certificates/:id/preview', attachSession, requireLogin, requireStaff, certificatePage(false))
  .get('/prescriptions/:id/print', attachSession, requireLogin, requireStaff, prescriptionPage);
