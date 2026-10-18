// Starts the clinic server. All wiring lives in app.js.
import { env } from './config/env.js';
import { pool, closePool } from './db/pool.js';
import { createClinicServer } from './app.js';

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error('PORT must be between 1 and 65535.');
}

// Fail fast with a clear message when MySQL is unreachable or the schema was never created.
try {
  await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
} catch (error) {
  console.error(
    `Cannot start: the database is not ready (${error.code || error.message}). ` +
    'Check DB_* settings and run "npm run migrate".'
  );
  await closePool().catch(() => {});
  process.exit(1);
}

const clinic = createClinicServer({
  allowedOrigin: env.allowedOrigin,
  config: env.clinic,
  onError: (error, req) => console.error(
    `Clinic request failed: ${req ? `${req.method} ${(req.originalUrl || req.url).split('?')[0]} ` : ''}${error.stack || error.message}`
  )
});

// Keep connections open longer than a typical reverse proxy's idle timeout (60 s for nginx/ALB).
clinic.server.keepAliveTimeout = 65000;

clinic.server.listen(env.port, env.host, () => {
  console.log(`Clinic server: http://${env.host}:${env.port} (${env.production ? 'production' : 'development'})`);
});

let shuttingDown = false;
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down (${reason}).`);
  // Never hang: a stuck connection must not stop a deploy or restart.
  setTimeout(() => process.exit(exitCode || 1), 10000).unref();
  try {
    clinic.server.closeIdleConnections?.();
    await clinic.close();
    await closePool();
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    exitCode = exitCode || 1;
  }
  process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => shutdown(signal));
process.on('unhandledRejection', reason => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});
