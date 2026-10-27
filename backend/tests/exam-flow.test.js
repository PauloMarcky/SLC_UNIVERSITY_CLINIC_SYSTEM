import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClinicServer } from '../app.js';
import { resetDatabase, closePool } from '../db/pool.js';
import { clinicToday } from '../utils/clinic-date.js';

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

const TODAY = clinicToday();
const TRIAGE = {
  patientId: '2026-00123', visitDate: TODAY, complaint: 'Headache and dizziness',
  bp: '118/76', weight: 60, height: 165
};

test('exam flow: free-text diagnosis, confidential checkbox and screening rules', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');

  // The nurse triages one Checkup and one Consultation.
  const a = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitType: 'Checkup' } });
  const b = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitType: 'Consultation' } });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const idA = a.data.visit.id;
  const idB = b.data.visit.id;

  // Only the doctor sees the queue and completes visits.
  assert.equal((await f.request('/api/visits/queue', { actor: nurse })).status, 403);
  const queue = await f.request('/api/visits/queue', { actor: doctor });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.data.visits.map(v => v.id).sort(), [idA, idB].sort());
  const full = { diagnosis: 'Acute tension headache', soapObjective: 'BP normal', actionsTaken: 'Rest and fluids' };
  assert.equal((await f.request(`/api/visits/${idA}/complete`, { actor: nurse, method: 'POST', body: full })).status, 403);

  // The diagnosis is required and limited to 500 characters; nothing else is required.
  assert.equal((await f.request(`/api/visits/${idA}/complete`, { actor: doctor, method: 'POST', body: { ...full, diagnosis: ' ' } })).status, 400);
  assert.equal((await f.request(`/api/visits/${idA}/complete`, { actor: doctor, method: 'POST', body: { ...full, diagnosis: 'x'.repeat(501) } })).status, 400);

  // A long free-text diagnosis is saved as typed (the old column only held 100 characters).
  const longDiagnosis = 'Urinary tract infection suspected from submitted laboratory results; ' +
    'advised hydration, repeat urinalysis in one week and follow-up with the clinic physician.';
  assert.ok(longDiagnosis.length > 100);
  const doneA = await f.request(`/api/visits/${idA}/complete`, { actor: doctor, method: 'POST',
    body: { ...full, diagnosis: longDiagnosis, putToScreening: true, screenedNote: 'UTI in lab results' } });
  assert.equal(doneA.status, 200);
  assert.equal(doneA.data.visit.diagnosis, longDiagnosis);
  assert.equal(doneA.data.visit.soapObjective, 'BP normal');
  assert.equal(doneA.data.visit.actionsTaken, 'Rest and fluids');
  assert.equal(doneA.data.visit.confidential, false);   // nothing is confidential unless the doctor ticks it
  assert.equal(doneA.data.visit.isScreened, false);     // the original stays a plain Checkup...

  // ...and Screening gets its own copy, which points back at the original.
  const screened = await f.request('/api/visits/screened', { actor: doctor });
  assert.equal(screened.status, 200);
  assert.equal(screened.data.visits.length, 1);
  const copy = screened.data.visits[0];
  assert.equal(copy.screenedCopyOf, idA);
  assert.equal(copy.visitType, 'Checkup');
  assert.equal(copy.diagnosis, longDiagnosis);
  assert.equal(copy.screenedNote, 'UTI in lab results');
  assert.equal(copy.isScreened, true);
  // The same checkup cannot be put to Screening a second time.
  assert.equal((await f.request(`/api/visits/${idA}/screen`, { actor: doctor, method: 'POST', body: {} })).status, 409);

  // Completing twice is refused.
  assert.equal((await f.request(`/api/visits/${idA}/complete`, { actor: doctor, method: 'POST', body: full })).status, 409);

  // A Consultation is never screened, and the confidential box hides it from the nurse.
  const doneB = await f.request(`/api/visits/${idB}/complete`, { actor: doctor, method: 'POST',
    body: { ...full, diagnosis: 'Anxiety, referred for counselling', confidential: true, putToScreening: true } });
  assert.equal(doneB.status, 200);
  assert.equal(doneB.data.visit.isScreened, false);
  assert.equal(doneB.data.visit.confidential, true);
  const nurseList = await f.request('/api/visits?search=2026-00123', { actor: nurse });
  assert.deepEqual(nurseList.data.visits.map(v => v.id).sort(), [idA, copy.id].sort());   // idB is hidden
  const doctorList = await f.request('/api/visits?search=2026-00123', { actor: doctor });
  assert.deepEqual(doctorList.data.visits.map(v => v.id).sort(), [idA, idB, copy.id].sort());

  // The direct doctor entry accepts free text too.
  const direct = await f.request('/api/visits', { actor: doctor, method: 'POST', body: {
    patientId: '2026-00123', visitType: 'Consultation', visitDate: TODAY, complaint: 'Cough',
    bp: '120/80', weight: 60, height: 165, diagnosis: 'Cough and colds, 3 days' } });
  assert.equal(direct.status, 201);
  assert.equal(direct.data.visit.diagnosis, 'Cough and colds, 3 days');
});
