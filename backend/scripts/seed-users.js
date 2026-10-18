import { createUser } from '../services/users.service.js';
import { closePool } from '../db/pool.js';

// Development accounts only. In production, set SEED_PASSWORD (12+ characters) so no well-known
// password ever reaches a real database, and change it after first login.
const DEV_PASSWORD = 'clinic-dev-2026';
const production = process.env.NODE_ENV === 'production';
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || DEV_PASSWORD;
if (production && (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD === DEV_PASSWORD)) {
  console.error('Refusing to seed well-known passwords in production. Set SEED_PASSWORD to a private password (12+ characters).');
  console.error('Better: skip seeding and use "npm run create-user" for each real staff account.');
  process.exit(1);
}

const defaults = [
  { username: 'nurse1', name: 'Default Nurse', role: 'nurse' },
  { username: 'doctor1', name: 'Default Doctor', role: 'doctor' },
];

for (const user of defaults) {
  try {
    await createUser({ ...user, password: DEFAULT_PASSWORD });
    console.log(`Created ${user.role} account: ${user.username} (${user.name}).`);
  } catch (error) {
    if (/Duplicate entry/i.test(error.message)) {
      console.log(`Skipped ${user.username}: already exists.`);
    } else {
      console.error(`Failed ${user.username}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (DEFAULT_PASSWORD === DEV_PASSWORD) {
  console.log(`\nDefault password for all accounts: ${DEFAULT_PASSWORD}`);
  console.log('Development only. Never use these credentials on a real deployment.');
} else {
  console.log('\nAccounts were created with the password from SEED_PASSWORD. Change it after first login.');
}

await closePool();