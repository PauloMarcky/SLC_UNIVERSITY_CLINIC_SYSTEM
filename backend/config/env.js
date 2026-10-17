// The only place that reads process.env. Everything else imports `env` from here.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_ROOT = resolve(BACKEND_ROOT, '..');
export const FRONTEND_ROOT = resolve(PROJECT_ROOT, 'frontend');

// Load backend/.env when it exists. Variables already set in the shell win over the file.
const envFile = resolve(BACKEND_ROOT, '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter(key => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Missing MySQL environment variable(s): ${missing.join(', ')}. ` +
    `Copy backend/.env.example to backend/.env and fill in your local MySQL credentials.`
  );
}

export const env = Object.freeze({
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),            // validated in server.js
  allowedOrigin: process.env.CLINIC_ORIGIN || undefined,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME
  }),
  clinic: Object.freeze({
    universityName: process.env.UNIVERSITY_NAME || 'University of La Salette, Inc.',
    clinicName: process.env.CLINIC_NAME || 'Health Services Department',
    clinicAddress: process.env.CLINIC_ADDRESS || '',
    clinicContact: process.env.CLINIC_CONTACT || ''
  })
});
