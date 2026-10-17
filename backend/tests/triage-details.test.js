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
const daysAgo = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const two = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const TRIAGE = {
  patientId: '2026-00123', visitDate: localToday(), complaint: 'Headache',
  bp: '118/76', weight: 60, height: 165, visitType: 'Checkup'
};

test('triage keeps nurse notes, the outside lab clinic name and the urgent flag; the doctor sees them', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');

  const plain = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: TRIAGE });
  assert.equal(plain.status, 201);
  assert.equal(plain.data.visit.labSourceName, '');
  assert.equal(plain.data.visit.labReceivedAt, null);
  assert.equal(plain.data.visit.urgent, false);

  const full = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: {
    ...TRIAGE, visitType: 'Consultation', nurseNotes: 'Lab shows high WBC. Student looks pale.',
    labSourceName: 'Santiago Diagnostic Center', labReceivedAt: daysAgo(3), urgent: true } });
  assert.equal(full.status, 201);
  assert.equal(full.data.visit.nurseNotes, 'Lab shows high WBC. Student looks pale.');
  assert.equal(full.data.visit.labSourceName, 'Santiago Diagnostic Center');
  assert.equal(full.data.visit.labReceivedAt, daysAgo(3), 'the nurse picked the date the lab result was received');
  assert.equal(full.data.visit.externalLabsAttached, true);
  assert.equal(full.data.visit.urgent, true);

  // Too-long notes are refused.
  assert.equal((await f.request('/api/visits/triage', { actor: nurse, method: 'POST',
    body: { ...TRIAGE, nurseNotes: 'x'.repeat(2001) } })).status, 400);

  // The doctor sees the nurse's notes and the lab clinic, and the urgent visit is first in the queue.
  const queue = await f.request('/api/visits/queue', { actor: doctor });
  assert.equal(queue.data.visits[0].id, full.data.visit.id);
  assert.equal(queue.data.visits[0].nurseNotes, 'Lab shows high WBC. Student looks pale.');
  assert.equal(queue.data.visits[0].labSourceName, 'Santiago Diagnostic Center');

  // The student's record shows the lab clinic and date once the visit is completed.
  const done = await f.request(`/api/visits/${full.data.visit.id}/complete`, { actor: doctor, method: 'POST',
    body: { diagnosis: 'Suspected infection' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.visit.nurseNotes, 'Lab shows high WBC. Student looks pale.');
  const record = await f.request('/api/patients/2026-00123/record', { actor: nurse });
  const row = record.data.record.visits.find(v => v.id === full.data.visit.id);
  assert.equal(row.labSourceName, 'Santiago Diagnostic Center');
  assert.equal(row.labReceivedAt, daysAgo(3));
});

test('medical history keeps the paper-form fields', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const saved = await f.request('/api/patients/2026-00123/history', { actor: nurse, method: 'PUT', body: {
    asthma: true, asthmaLastAttack: 'March 2024', asthmaMedicine: 'Salbutamol',
    allergy: true, allergyFood: 'Shrimp', allergyMedicine: 'Penicillin', hepatitisB: true } });
  assert.equal(saved.status, 200);
  const history = (await f.request('/api/patients/2026-00123/history', { actor: nurse })).data.history;
  assert.equal(history.asthmaLastAttack, 'March 2024');
  assert.equal(history.asthmaMedicine, 'Salbutamol');
  assert.equal(history.allergyFood, 'Shrimp');
  assert.equal(history.allergyMedicine, 'Penicillin');
  assert.equal(history.hepatitisB, true);
  assert.equal(history.asthma, true);
});


test('the lab received date defaults to today, and a future or very old date is refused', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const lab = { ...TRIAGE, labSourceName: 'Santiago Diagnostic Center' };
  const post = body => f.request('/api/visits/triage', { actor: nurse, method: 'POST', body });

  const noDate = await post(lab);
  assert.equal(noDate.status, 201);
  assert.equal(noDate.data.visit.labReceivedAt, localToday(), 'no date typed means today');

  assert.equal((await post({ ...lab, labReceivedAt: daysAgo(-1) })).status, 400, 'tomorrow');
  assert.equal((await post({ ...lab, labReceivedAt: daysAgo(400) })).status, 400, 'over a year ago');
  assert.equal((await post({ ...lab, labReceivedAt: 'not-a-date' })).status, 400);

  // A date without a clinic name is ignored: there is nothing to attach it to.
  const orphan = await post({ ...TRIAGE, labReceivedAt: daysAgo(2) });
  assert.equal(orphan.status, 201);
  assert.equal(orphan.data.visit.labReceivedAt, null);

  // Editing keeps the picked date unless a new one is sent.
  const first = await post({ ...lab, labReceivedAt: daysAgo(5) });
  const keep = await f.request(`/api/visits/${first.data.visit.id}`, { actor: nurse, method: 'PUT', body: { ...lab, complaint: 'Cough' } });
  assert.equal(keep.status, 200);
  assert.equal(keep.data.visit.labReceivedAt, daysAgo(5));
  const change = await f.request(`/api/visits/${first.data.visit.id}`, { actor: nurse, method: 'PUT', body: { ...lab, labReceivedAt: daysAgo(1) } });
  assert.equal(change.data.visit.labReceivedAt, daysAgo(1));
});