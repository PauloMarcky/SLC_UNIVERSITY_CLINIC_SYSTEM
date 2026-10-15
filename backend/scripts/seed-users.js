import { createUser } from '../stores/store.js';
import { closePool } from '../config/db.js';

const DEFAULT_PASSWORD = 'clinic-dev-2026';

const defaults = [
  { username: 'nurse1',    name: 'Default Nurse',  role: 'nurse'    },
  { username: 'doctor1',   name: 'Default Doctor', role: 'doctor'   },
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

console.log(`\nDefault password for all accounts: ${DEFAULT_PASSWORD}`);
console.log('Change these credentials before any real deployment.');

await closePool();