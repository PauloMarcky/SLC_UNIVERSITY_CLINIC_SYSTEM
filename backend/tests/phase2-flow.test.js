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

const localToday = () => {
  const d = new Date();
  const two = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const BASE = { patientId: '2026-00123', visitDate: localToday() };
const CONSULT = { ...BASE, visitType: 'Consultation', complaint: 'Cough', bp: '118/76', weight: 60, height: 165 };

test('vitals are required for a Consultation and optional for a Checkup', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const post = body => f.request('/api/visits/triage', { actor: nurse, method: 'POST', body });

  // A Checkup can be recorded with no vitals at all; nothing shows as an error.
  const empty = await post({ ...BASE, visitType: 'Checkup' });
  assert.equal(empty.status, 201);
  assert.equal(empty.data.visit.bp, '');
  assert.equal(empty.data.visit.bmi, null);
  assert.equal(empty.data.visit.bmiStatus, '');

  // Weight without height gives no BMI; both together do.
  const weightOnly = await post({ ...BASE, visitType: 'Checkup', weight: 60 });
  assert.equal(weightOnly.data.visit.weightKg, 60);
  assert.equal(weightOnly.data.visit.bmi, null);
  const all = await post({ ...BASE, visitType: 'Checkup', weight: 60, height: 165, bp: '118/76' });
  assert.equal(all.data.visit.bmi, 22);
  assert.equal(all.data.visit.bpStatus, 'Normal');

  // A typed value must still be realistic, even for a Checkup.
  assert.equal((await post({ ...BASE, visitType: 'Checkup', bp: 'abc' })).status, 400);

  // A Consultation needs BP, weight, height and the complaint.
  assert.equal((await post(CONSULT)).status, 201);
  for (const missing of ['bp', 'weight', 'height', 'complaint']) {
    const body = { ...CONSULT };
    delete body[missing];
    assert.equal((await post(body)).status, 400, `Consultation without ${missing}`);
  }
});

test('the nurse can edit or cancel a waiting visit; the doctor cannot edit it', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const made = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: CONSULT });
  const id = made.data.visit.id;

  assert.equal((await f.request(`/api/visits/${id}`, { actor: doctor, method: 'PUT', body: CONSULT })).status, 403);
  assert.equal((await f.request(`/api/visits/${id}/cancel`, { actor: doctor, method: 'POST', body: {} })).status, 403);

  const edited = await f.request(`/api/visits/${id}`, { actor: nurse, method: 'PUT',
    body: { ...CONSULT, complaint: 'Cough and fever', weight: 62, labSourceName: 'City Lab' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.visit.complaint, 'Cough and fever');
  assert.equal(edited.data.visit.weightKg, 62);
  assert.equal(edited.data.visit.labSourceName, 'City Lab');
  assert.equal(edited.data.visit.labReceivedAt, localToday());
  assert.equal((await f.request(`/api/visits/${id}`, { actor: nurse, method: 'PUT', body: { ...CONSULT, bp: 'bad' } })).status, 400);
  assert.equal((await f.request('/api/visits/999999', { actor: nurse, method: 'PUT', body: CONSULT })).status, 404);

  // Cancelling takes it out of the queue, and it cannot be edited, cancelled again or completed.
  const cancelled = await f.request(`/api/visits/${id}/cancel`, { actor: nurse, method: 'POST', body: {} });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.visit.status, 'cancelled');
  assert.equal((await f.request('/api/visits/queue', { actor: doctor })).data.visits.length, 0);
  assert.equal((await f.request(`/api/visits/${id}`, { actor: nurse, method: 'PUT', body: CONSULT })).status, 409);
  assert.equal((await f.request(`/api/visits/${id}/cancel`, { actor: nurse, method: 'POST', body: {} })).status, 409);
  assert.equal((await f.request(`/api/visits/${id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'x' } })).status, 409);

  // Once the doctor has completed a visit, the nurse can no longer change it.
  const second = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: CONSULT });
  await f.request(`/api/visits/${second.data.visit.id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'Cough' } });
  assert.equal((await f.request(`/api/visits/${second.data.visit.id}`, { actor: nurse, method: 'PUT', body: CONSULT })).status, 409);
  assert.equal((await f.request(`/api/visits/${second.data.visit.id}/cancel`, { actor: nurse, method: 'POST', body: {} })).status, 409);
});

test('a Checkup ends as Cleared or Needs screening; only Needs screening makes a Screening copy', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const triage = async () => (await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...BASE, visitType: 'Checkup' } })).data.visit.id;
  const complete = (id, body) => f.request(`/api/visits/${id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'Healthy', ...body } });

  const cleared = await complete(await triage(), { checkupResult: 'Cleared' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.visit.checkupResult, 'Cleared');
  assert.equal((await f.request('/api/visits/screened', { actor: doctor })).data.visits.length, 0);

  assert.equal((await complete(await triage(), { checkupResult: 'Maybe' })).status, 400);

  const needs = await complete(await triage(), { checkupResult: 'Needs screening', screenedNote: 'High WBC' });
  assert.equal(needs.data.visit.checkupResult, 'Needs screening');
  const screened = (await f.request('/api/visits/screened', { actor: doctor })).data.visits;
  assert.equal(screened.length, 1);
  assert.equal(screened[0].screenedCopyOf, needs.data.visit.id);
  assert.equal(screened[0].isScreeningCopy, true);

  // The older screen that only sends the screening tick still works.
  const legacy = await complete(await triage(), { putToScreening: true });
  assert.equal(legacy.data.visit.checkupResult, 'Needs screening');
  assert.equal((await f.request('/api/visits/screened', { actor: doctor })).data.visits.length, 2);

  // A Consultation has no checkup result.
  const consult = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: CONSULT });
  const done = await complete(consult.data.visit.id, {});
  assert.equal(done.data.visit.checkupResult, null);

  // copies=exclude lists each checkup once.
  const all = (await f.request('/api/visits?type=Checkup', { actor: doctor })).data.visits;
  const once = (await f.request('/api/visits?type=Checkup&copies=exclude', { actor: doctor })).data.visits;
  assert.equal(all.length - once.length, 2);
  assert.ok(once.every(v => !v.isScreeningCopy));
});

test('a confidential visit hides who and how old the patient is, and the vitals, from the nurse', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const made = await f.request('/api/visits/triage', { actor: nurse, method: 'POST',
    body: { ...CONSULT, nurseNotes: 'Private note', pulseRate: 80, temperature: 37 } });
  await f.request(`/api/visits/${made.data.visit.id}/complete`, { actor: doctor, method: 'POST',
    body: { diagnosis: 'Sensitive diagnosis', confidential: true } });

  const seenByNurse = (await f.request('/api/visits', { actor: nurse })).data.visits.find(v => v.id === made.data.visit.id);
  assert.equal(seenByNurse.patientName, 'Student (hidden)');
  assert.equal(seenByNurse.college, '');
  assert.equal(seenByNurse.course, '');
  assert.equal(seenByNurse.yearLevel, '');
  assert.equal(seenByNurse.sex, '');
  assert.equal(seenByNurse.age, null);
  assert.equal(seenByNurse.bp, '');
  assert.equal(seenByNurse.weightKg, null);
  assert.equal(seenByNurse.heightCm, null);
  assert.equal(seenByNurse.bmi, null);
  assert.equal(seenByNurse.pulseRate, null);
  assert.equal(seenByNurse.bodyTemperature, null);
  assert.equal(seenByNurse.nurseNotes, '');
  assert.equal(seenByNurse.diagnosis, 'Confidential');

  const seenByDoctor = (await f.request('/api/visits', { actor: doctor })).data.visits.find(v => v.id === made.data.visit.id);
  assert.equal(seenByDoctor.college, 'IT');
  assert.equal(seenByDoctor.bp, '118/76');
  assert.equal(seenByDoctor.nurseNotes, 'Private note');
  assert.equal(seenByDoctor.diagnosis, 'Sensitive diagnosis');
});

test.skip('removed: inventory no longer exists', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  // The bodies are deliberately invalid: a refused role is 403, everything else is a normal validation error.
  const adjustByNurse = await f.request('/api/inventory/adjust', { actor: nurse, method: 'POST', body: {} });
  assert.equal(adjustByNurse.status, 403);
  const adjustByDoctor = await f.request('/api/inventory/adjust', { actor: doctor, method: 'POST', body: {} });
  assert.notEqual(adjustByDoctor.status, 403);
  assert.notEqual((await f.request('/api/inventory/receive', { actor: nurse, method: 'POST', body: {} })).status, 403);
  assert.notEqual((await f.request('/api/inventory/receive', { actor: doctor, method: 'POST', body: {} })).status, 403);
});