import { createUser } from './store.js';
import { closePool } from './db.js';

const [username, role, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ');
if (!username || !role || !name) {
  console.error('Usage: node create-user.js <username> <nurse|doctor|student|employee> <Full Name>'); console.error('For student/employee: set CLINIC_USER_PATIENT_ID to the patient record ID.');
  process.exit(1);
}

async function hiddenPassword() {
  if (!process.stdin.isTTY) {
    throw new Error('Set CLINIC_USER_PASSWORD for non-interactive account creation.');
  }
  // Keep the password out of command history, arguments, and terminal output.
  process.stdout.write('Password (12–200 characters): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolvePassword, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = chunk => {
      for (const character of chunk) {
        if (character === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (character === '\r' || character === '\n') { finish(); resolvePassword(value); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && value.length < 200) value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

try {
  const password = process.env.CLINIC_USER_PASSWORD || await hiddenPassword();
  const user = await createUser({ username, role, name, password, patientId: process.env.CLINIC_USER_PATIENT_ID || null });
  console.log(`Created ${user.role} account: ${user.username} (${user.name}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}