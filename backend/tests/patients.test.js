import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClinicServer } from '../app.js';
import { resetDatabase, closePool } from '../db/pool.js';

after(async () => {
  await closePool();
});

const PASSWORD = 'A-long-disposable-test-password';

async function fixture(t) {
  await resetDatabase();
  const clinic = createClinicServer();
  await clinic.createUser({ username: 'nurse.test', name: 'Nurse Test', password: PASSWORD, role: 'nurse' });
  await clinic.createUser({ username: 'doctor.test', name: 'Doctor Test', password: PASSWORD, role: 'doctor' });
  await new Promise(resolve => clinic.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${clinic.server.address().port}`;
  t.after(async () => {
    await clinic.close();
  });
  async function request(path, { actor, method = 'GET', body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(actor ? { Cookie: actor.cookie, 'X-CSRF-Token': actor.csrfToken } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data, headers: response.headers };
  }
  async function login(username) {
    const result = await request('/api/login', { method: 'POST', body: { username, password: PASSWORD, role: 'doctor' } });
    assert.equal(result.status, 200);
    return { ...result.data, cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  return { request, login };
}

test('student records: list, register, read and edit a patient', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');

  // The list needs a session and returns the fields the Student Records page shows.
  assert.equal((await f.request('/api/patients')).status, 401);
  const list = await f.request('/api/patients', { actor: nurse });
  assert.equal(list.status, 200);
  const maria = list.data.patients.find(p => p.id === '2026-00123');
  assert.ok(maria, 'seeded patient is listed');
  assert.ok('dateOfBirth' in maria && 'lastVisit' in maria);
  assert.equal(maria.lastVisit, null);

  // Register with the full form.
  const created = await f.request('/api/patients', { actor: nurse, method: 'POST', body: {
    id: 'TEST-001', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos',
    college: 'College of Nursing', gender: 'Male', dateOfBirth: '2007-03-08', civilStatus: 'Single',
    nationality: 'Filipino', contactNumber: '0917 000 0000', address: 'Sample address',
    guardianName: 'Maria Dela Cruz', guardianContact: '0918 000 0000'
  } });
  assert.equal(created.status, 201);
  assert.equal(created.data.patient.name, 'Juan Santos Dela Cruz');
  assert.equal((await f.request('/api/patients', { actor: nurse, method: 'POST', body: { id: 'TEST-001', lastName: 'A', firstName: 'B' } })).status, 409);

  // Read one patient back.
  const read = await f.request('/api/patients/TEST-001', { actor: doctor });
  assert.equal(read.status, 200);
  assert.equal(read.data.patient.dateOfBirth, '2007-03-08');
  assert.equal(read.data.patient.guardianContact, '0918 000 0000');
  assert.equal((await f.request('/api/patients/NOPE', { actor: nurse })).status, 404);

  // The list shows the date of birth for the new student.
  const again = await f.request('/api/patients?search=TEST-001', { actor: nurse });
  assert.equal(again.data.patients[0].dateOfBirth, '2007-03-08');

  // Only the nurse edits, the ID stays, the name is rebuilt from its parts.
  const edit = { lastName: 'Reyes', firstName: 'Juan', middleName: '', college: 'College of Education',
    gender: 'Male', dateOfBirth: '2007-03-09', civilStatus: 'Married', nationality: 'Filipino',
    contactNumber: '0999', address: 'New address', guardianName: 'G', guardianContact: '1' };
  assert.equal((await f.request('/api/patients/TEST-001', { actor: doctor, method: 'PUT', body: edit })).status, 403);
  assert.equal((await f.request('/api/patients/NOPE', { actor: nurse, method: 'PUT', body: edit })).status, 404);
  assert.equal((await f.request('/api/patients/TEST-001', { actor: nurse, method: 'PUT', body: { ...edit, lastName: ' ' } })).status, 400);
  assert.equal((await f.request('/api/patients/TEST-001', { actor: nurse, method: 'PUT', body: { ...edit, dateOfBirth: '2007-02-31' } })).status, 400);

  const saved = await f.request('/api/patients/TEST-001', { actor: nurse, method: 'PUT', body: edit });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.patient.id, 'TEST-001');
  assert.equal(saved.data.patient.name, 'Juan Reyes');
  assert.equal(saved.data.patient.college, 'College of Education');
  assert.equal(saved.data.patient.dateOfBirth, '2007-03-09');
  assert.equal(saved.data.patient.category, 'student');
});
