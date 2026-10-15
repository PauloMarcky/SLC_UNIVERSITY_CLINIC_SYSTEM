import { createClinicApp } from './app.js';
import { pool } from './config/db.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be between 1 and 65535.');
}

const app = createClinicApp({
  config: {
    universityName: process.env.UNIVERSITY_NAME || 'University of La Salette',
    clinicName: process.env.CLINIC_NAME || 'University Clinic',
    clinicAddress: process.env.CLINIC_ADDRESS || '',
    clinicContact: process.env.CLINIC_CONTACT || ''
  },
  onError: error => console.error('Clinic request failed:', error.message)
});

const server = app.listen(port, host, () => {
  console.log(`Clinic server running at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    console.log('Shutting down server gracefully...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}