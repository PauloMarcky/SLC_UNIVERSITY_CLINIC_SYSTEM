import { closePool } from './db.js';
import { createClinicServer } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const clinic = createClinicServer({
  // dbPath removed — schema and pool now come from db.js.
  allowedOrigin: process.env.CLINIC_ORIGIN || undefined,
  config: {
    universityName: process.env.UNIVERSITY_NAME || 'Saint Louis College',
    clinicName: process.env.CLINIC_NAME || 'University Clinic',
    clinicAddress: process.env.CLINIC_ADDRESS || '',
    clinicContact: process.env.CLINIC_CONTACT || ''
  },
  onError: error => console.error('Clinic request failed:', error.message)
});
clinic.server.listen(port, host, () => console.log(`Clinic server: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await clinic.close();
    await closePool();
    process.exit(0);
  });
}
