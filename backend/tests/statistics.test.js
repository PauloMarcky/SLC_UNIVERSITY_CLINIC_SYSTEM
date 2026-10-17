import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClinicServer } from '../app.js';
import { resetDatabase, closePool } from '../db/pool.js';

after(async () => {
  await closePool();
});

const PASSWORD = 'A-long-disposable-test-password';
const TODAY = new Date().toISOString().slice(0, 10);

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

// A visit is triaged by the nurse; the doctor completes it unless `finish` is false.
async function visit(f, nurse, doctor, { patientId, visitType, weight = 60, visitDate = TODAY, diagnosis = 'Test diagnosis', finish = true, ...complete }) {
  const triage = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: {
    patientId, visitType, visitDate, complaint: 'Test complaint', bp: '118/76', weight, height: 165 } });
  assert.equal(triage.status, 201);
  if (!finish) return triage.data.visit.id;
  const done = await f.request(`/api/visits/${triage.data.visit.id}/complete`, { actor: doctor, method: 'POST',
    body: { diagnosis, soapObjective: 'Findings', actionsTaken: 'Advice', ...complete } });
  assert.equal(done.status, 200);
  return done.data.visit.id;
}

test('statistics: counts, filters, screening copies, free-text diagnoses and access', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const stats = (query, actor = doctor) => f.request('/api/statistics?' + query, { actor });
  const labelsOf = list => list.map(row => row.label);

  // Checkups: Maria (IT, also put to Screening, which saves a copy), Paolo (Engineering, underweight),
  // Angela (Nursing, obese, sent to hospital, an old date), Jose (Maintenance, overweight).
  await visit(f, nurse, doctor, { patientId: '2026-00123', visitType: 'Checkup', putToScreening: true, screenedNote: 'Check' });
  await visit(f, nurse, doctor, { patientId: '2025-00456', visitType: 'Checkup', weight: 40 });
  await visit(f, nurse, doctor, { patientId: '2024-00789', visitType: 'Checkup', weight: 90, sentToHospital: true, visitDate: '2026-01-15' });
  await visit(f, nurse, doctor, { patientId: 'E-0098', visitType: 'Checkup', weight: 70 });
  // Consultations: "Flu" is written three ways, one is confidential and sent to hospital.
  await visit(f, nurse, doctor, { patientId: '2026-00123', visitType: 'Consultation', diagnosis: 'Flu' });
  await visit(f, nurse, doctor, { patientId: '2025-00456', visitType: 'Consultation', diagnosis: 'FLU' });
  await visit(f, nurse, doctor, { patientId: '2024-00789', visitType: 'Consultation', diagnosis: 'Headache', sentToHospital: true, confidential: true });
  await visit(f, nurse, doctor, { patientId: '2026-00123', visitType: 'Consultation', diagnosis: ' flu ' });
  // Still in the Exam Queue, so it is not a case yet.
  await visit(f, nurse, doctor, { patientId: 'E-0098', visitType: 'Consultation', finish: false });

  // Access: nobody logged in, a nurse, bad input.
  assert.equal((await f.request('/api/statistics?type=Checkup')).status, 401);
  for (const bad of ['', 'type=Other', 'type=Checkup&from=17-10-2026', 'type=Checkup&to=x',
    'type=Checkup&from=2026-02-01&to=2026-01-01', 'type=Checkup&from=2026-02-31']) {
    assert.equal((await stats(bad)).status, 400, bad);
  }

  // Checkups: the Screening copy and nothing else extra is counted.
  const c = (await stats('type=Checkup')).data;
  assert.equal(c.total, 4);
  assert.equal(c.averageBmi, 23.9);                       // (22.0 + 14.7 + 33.1 + 25.7) / 4 = 23.875
  assert.deepEqual(c.bmi, [
    { label: 'Underweight', count: 1 }, { label: 'Normal', count: 1 },
    { label: 'Overweight', count: 1 }, { label: 'Obese', count: 1 }]);
  assert.equal(c.sentToHospital, 1);
  assert.deepEqual(labelsOf(c.byCollege), ['Engineering', 'IT', 'Maintenance', 'Nursing']);
  assert.deepEqual(c.colleges, ['Engineering', 'IT', 'Maintenance', 'Nursing']);
  assert.equal(c.topDiagnoses, undefined);

  // Dates (both ends included) and the department filter. The department list keeps every department.
  assert.equal((await stats(`type=Checkup&from=${TODAY}`)).data.total, 3);
  assert.equal((await stats('type=Checkup&to=2026-01-31')).data.total, 1);
  assert.equal((await stats('type=Checkup&from=2026-01-15&to=2026-01-15')).data.total, 1);
  assert.equal((await stats('type=Checkup&from=2999-01-01')).data.total, 0);
  const empty = (await stats('type=Checkup&from=2999-01-01')).data;
  assert.equal(empty.averageBmi, null);
  assert.ok(empty.bmi.every(row => row.count === 0));
  const it = (await stats('type=Checkup&college=IT')).data;
  assert.equal(it.total, 1);
  assert.equal(it.averageBmi, 22);
  assert.equal(it.byCollege.length, 4);
  assert.equal(it.colleges.length, 4);
  assert.equal((await stats('type=Checkup&college=Nope')).data.total, 0);

  // Consultations: identical wording counts together whatever the capital letters, and the queue visit is left out.
  const q = (await stats('type=Consultation')).data;
  assert.equal(q.total, 4);
  assert.equal(q.sentToHospital, 1);
  assert.equal(q.topDiagnoses.length, 2);
  assert.equal(q.topDiagnoses[0].label.toLowerCase(), 'flu');
  assert.equal(q.topDiagnoses[0].count, 3);
  assert.deepEqual(q.topDiagnoses[1], { label: 'Headache', count: 1 });
  assert.equal(q.distinctDiagnoses, 2);
  assert.equal(q.bmi, undefined);
  assert.equal(q.averageBmi, undefined);
  assert.deepEqual(q.byCollege.map(row => [row.label, row.count]), [['IT', 2], ['Engineering', 1], ['Nursing', 1]]);
  const nursing = (await stats('type=Consultation&college=Nursing')).data;
  assert.equal(nursing.total, 1);
  assert.deepEqual(nursing.topDiagnoses, [{ label: 'Headache', count: 1 }]);
  assert.equal(nursing.byCollege.length, 3);

  // A nurse may open the pages, but a confidential visit is never counted, listed or named.
  const nc = (await stats('type=Checkup', nurse)).data;
  assert.equal(nc.total, 4);
  const nq = (await stats('type=Consultation', nurse)).data;
  assert.equal(nq.total, 3);
  assert.equal(nq.sentToHospital, 0);
  assert.deepEqual(nq.topDiagnoses.map(row => row.label.toLowerCase()), ['flu']);
  assert.equal(nq.distinctDiagnoses, 1);
  assert.deepEqual(labelsOf(nq.byCollege), ['IT', 'Engineering']);
  assert.ok(!nq.colleges.includes('Nursing'));
  assert.equal((await stats('type=Consultation&college=Nursing', nurse)).data.total, 0);
});
