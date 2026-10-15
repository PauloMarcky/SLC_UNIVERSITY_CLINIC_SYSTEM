import { createUser } from '../store.js';
import { closePool } from '../db.js';

const DEFAULT_PASSWORD = 'clinic-dev-2026';

const defaults = [
  { username: 'nurse1',    name: 'Default Nurse',  role: 'nurse'    },
  { username: 'doctor1',   name: 'Default Doctor', role: 'doctor'   },
  { username: 'student1',  name: 'Maria Dizon',    role: 'student',  patientId: '2026-00123' },
  { username: 'employee1', name: 'Jose Ramos',     role: 'employee', patientId: 'E-0098'     },
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