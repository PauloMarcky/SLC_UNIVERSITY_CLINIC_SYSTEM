// Starts the clinic server. All wiring lives in app.js.
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { createClinicServer } from './app.js';

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error('PORT must be between 1 and 65535.');
}

const clinic = createClinicServer({
  allowedOrigin: env.allowedOrigin,
  config: env.clinic,
  onError: error => console.error('Clinic request failed:', error.message)
});

clinic.server.listen(env.port, env.host, () => {
  console.log(`Clinic server: http://${env.host}:${env.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await clinic.close();
    await closePool();
    process.exit(0);
  });
}
