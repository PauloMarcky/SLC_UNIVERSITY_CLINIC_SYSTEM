// Builds the HTTP app. Does not listen: server.js (or a test) does that.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { env, FRONTEND_ROOT } from './config/env.js';
import { pool } from './db/pool.js';
import { createApp } from './utils/framework.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createLoginRateLimit } from './middleware/loginRateLimit.js';
import { staticFiles } from './middleware/staticFiles.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/index.js';
import { pagesRoutes } from './routes/pages.routes.js';
import { createUser } from './services/users.service.js';

/**
 * Order matters:
 *   security headers -> /api -> printable pages -> frontend files -> error handler
 */
export function createClinicApp(options = {}) {
  const app = createApp();
  app.locals.clinicConfig = { ...env.clinic, ...(options.config || {}) };
  app.locals.cookieSecure = options.secureCookie ?? env.cookieSecure;

  const allowedOrigin = options.allowedOrigin ?? env.allowedOrigin;
  const loginLimiter = createLoginRateLimit(options.loginAttemptLimit ?? 30);

  app.use(securityHeaders);
  app.use('/api', createApiRouter({ allowedOrigin, loginLimiter }));
  app.use(pagesRoutes);
  app.use(staticFiles(resolve(options.publicRoot || FRONTEND_ROOT)));
  app.use(createErrorHandler(options.onError));
  return app;
}

/** Same shape the old app.js returned, so existing tests and scripts keep working. */
export function createClinicServer(options = {}) {
  const server = createServer(createClinicApp(options));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return {
    server,
    pool,
    createUser,
    close: async () => {
      if (server.listening) {
        await new Promise((resolveClose, reject) =>
          server.close(error => error ? reject(error) : resolveClose())
        );
      }
    }
  };
}
