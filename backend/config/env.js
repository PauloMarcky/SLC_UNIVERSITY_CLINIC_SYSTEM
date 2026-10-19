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

const isProduction = process.env.NODE_ENV === 'production';
const isTest = /_test$/i.test(String(process.env.DB_NAME));

/** TRUST_PROXY: a hop count ("1"), "true", or a comma-separated list of proxy addresses/subnets. */
function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

// Refuse to start in production with settings that are only acceptable on a developer machine.
if (isProduction && !isTest) {
  const problems = [];
  if (!process.env.DB_PASSWORD) problems.push('DB_PASSWORD is empty.');
  if (process.env.DB_USER === 'root' && process.env.ALLOW_DB_ROOT !== 'true') problems.push('DB_USER is "root". Create a dedicated MySQL user for the app, or set ALLOW_DB_ROOT=true to accept the risk.');
  if (/^(change-this-password|password|root|admin)$/i.test(process.env.DB_PASSWORD || '')) {
    problems.push('DB_PASSWORD is a placeholder or a well-known default.');
  }
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
  if (process.env.COOKIE_SECURE !== 'true') {
    console.warn(
      'WARNING: COOKIE_SECURE is not "true". Session cookies will be sent over plain HTTP. ' +
      'Serve the site over HTTPS and set COOKIE_SECURE=true.'
    );
  }
}

export const env = Object.freeze({
  production: isProduction,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),            // validated in server.js
  allowedOrigin: process.env.CLINIC_ORIGIN || undefined,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  logRequests: process.env.LOG_REQUESTS ? process.env.LOG_REQUESTS === 'true' : isProduction,
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
