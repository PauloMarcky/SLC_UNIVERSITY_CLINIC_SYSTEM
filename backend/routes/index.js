import { Router } from 'express';
import authRoutes from './auth.routes.js';

export function createApiRouter(options = {}) {
  const router = Router();

  // Mount Authentication routes (/api/login, /api/session, /api/logout)
  router.use('/', authRoutes);

  return router;
}