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
  async function login(username, role) {
    const result = await request('/api/login', { method: 'POST', body: { username, password: PASSWORD, role } });
    assert.equal(result.status, 200);
    return { ...result.data, cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  return { request, login };
}

// Dates are worked out from today so the tests pass on any day.
const two = n => String(n).padStart(2, '0');
const shift = days => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};

async function setup(t) {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test', 'nurse');
  const doctor = await f.login('doctor.test', 'doctor');
  const makeYear = async (label, startDate, endDate) => {
    const res = await f.request('/api/school-years', { actor: doctor, method: 'POST', body: { label, startDate, endDate } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.schoolYear;
  };
  // A completed checkup on a given date.
  const visit = async (visitDate, patientId = '2026-00123', diagnosis = 'Healthy') => {
    const triage = await f.request('/api/visits/triage', {
      actor: nurse, method: 'POST', body: { patientId, visitType: 'Checkup', visitDate }
    });
    assert.equal(triage.status, 201, JSON.stringify(triage.data));
    const done = await f.request(`/api/visits/${triage.data.visit.id}/complete`, {
      actor: doctor, method: 'POST', body: { diagnosis, checkupResult: 'Cleared' }
    });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    return done.data.visit;
  };
  return { ...f, nurse, doctor, makeYear, visit };
}


const ALL = { cbc: true, cxrPa: true, urinalysis: true, fecalysis: true, hepaBScreening: true, hepaBTiter: true, bloodType: true, pregnancyTest: true, drugTest: true };
const put = (f, actor, id, body) => f.request(`/api/patients/${id}/requirements`, { actor, method: 'PUT', body });
const get = (f, actor, id) => f.request(`/api/patients/${id}/requirements`, { actor });

test('laboratory requirements: all nine start missing; ticks keep their first date; omitted boxes are left alone', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/api/patients/2026-00123/requirements')).status, 401);
  const start = (await get(f, f.nurse, '2026-00123')).data.requirements;
  assert.deepEqual(start.items.map(i => i.label), ['CBC', 'CXR-PA', 'Urinalysis', 'Fecalysis', 'Hepa-B Screening', 'Hepa-B Titer', 'Blood Type', 'Pregnancy Test', 'Drug Test']);
  assert.equal(start.completed, 0);
  assert.equal(start.required, 9);
  assert.equal(start.complete, false);

  const first = await put(f, f.nurse, '2026-00123', { cbc: true, drugTest: true });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.requirements.completed, 2);
  assert.equal(first.data.requirements.items[0].date, shift(0));

  // Another save: CBC stays (and keeps its date), drug test is unticked, Urinalysis is added, the rest is not mentioned.
  const second = (await put(f, f.doctor, '2026-00123', { drugTest: false, urinalysis: true })).data.requirements;
  const byKey = Object.fromEntries(second.items.map(i => [i.key, i]));
  assert.equal(byKey.cbc.done, true);
  assert.equal(byKey.cbc.date, shift(0));
  assert.equal(byKey.drugTest.done, false);
  assert.equal(byKey.urinalysis.done, true);
  assert.equal(second.completed, 2);

  assert.equal((await put(f, f.nurse, '2026-00123', { cbc: 'yes' })).status, 400);
  assert.equal((await put(f, f.nurse, 'NOPE', { cbc: true })).status, 404);
  assert.equal((await f.request('/api/patients/2026-00123/requirements', { method: 'PUT', body: { cbc: true } })).status, 401);

  const complete = (await put(f, f.nurse, '2026-00123', ALL)).data.requirements;
  assert.equal(complete.complete, true);
  assert.equal(complete.completed, 9);
});

test('the pregnancy test is not counted for a male student', async t => {
  const f = await setup(t);
  const male = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: 'M-1', lastName: 'Cruz', firstName: 'Ben', gender: 'Male' } });
  assert.equal(male.status, 201);
  const female = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: 'F-1', lastName: 'Cruz', firstName: 'Bea', gender: 'Female' } });
  assert.equal(female.status, 201);
  const m = (await get(f, f.nurse, 'M-1')).data.requirements;
  assert.equal(m.required, 8);
  assert.equal(m.items.find(i => i.key === 'pregnancyTest').applicable, false);
  const { pregnancyTest, ...withoutPregnancy } = ALL;
  assert.equal((await put(f, f.nurse, 'M-1', withoutPregnancy)).data.requirements.complete, true);
  assert.equal((await put(f, f.nurse, 'F-1', withoutPregnancy)).data.requirements.complete, false);
  assert.equal((await put(f, f.nurse, 'F-1', { pregnancyTest: true })).data.requirements.complete, true);
});

test('Student Records shows requirements done / needed and can filter by them', async t => {
  const f = await setup(t);
  await f.makeYear('Now', shift(-200), shift(100));
  for (const id of ['A-1', 'A-2', 'A-3']) {
    assert.equal((await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id, lastName: id, firstName: 'S', gender: 'Female' } })).status, 201);
  }
  await put(f, f.nurse, 'A-1', ALL);
  await put(f, f.nurse, 'A-2', { cbc: true, bloodType: true, drugTest: true });
  const list = async q => (await f.request(`/api/patients?search=A-&limit=20&schoolYear=current${q}`, { actor: f.nurse })).data;
  const everyone = await list('');
  const row = id => everyone.patients.find(p => p.id === id);
  assert.deepEqual([row('A-1').requirementsDone, row('A-1').requirementsNeeded], [9, 9]);
  assert.deepEqual([row('A-2').requirementsDone, row('A-2').requirementsNeeded], [3, 9]);
  assert.deepEqual([row('A-3').requirementsDone, row('A-3').requirementsNeeded], [0, 9]);
  const incomplete = await list('&requirements=incomplete');
  assert.deepEqual(incomplete.patients.map(p => p.id), ['A-2', 'A-3']);
  assert.equal(incomplete.total, 2);                                // the counts follow the filter
  const finished = await list('&requirements=complete');
  assert.deepEqual(finished.patients.map(p => p.id), ['A-1']);
});

test('requirements and history stay with the student when a new school year starts and they are enrolled again', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  const visit = await f.visit(shift(-400));                         // 2026-00123 is on the Past list
  assert.ok(visit);
  await put(f, f.nurse, '2026-00123', { cbc: true, cxrPa: true, bloodType: true });
  const history = await f.request('/api/patients/2026-00123/history', { actor: f.nurse, method: 'PUT', body: { asthma: true } });
  assert.equal(history.status, 200);
  const now = await f.makeYear('Now', shift(-200), shift(100));

  const roster = async id => (await f.request(`/api/patients?search=&limit=20&schoolYear=${id}`, { actor: f.nurse })).data.patients.map(p => p.id);
  assert.deepEqual(await roster(now.id), []);                       // the new year starts empty

  // The student is added again in the new year (a blank form, as an import would).
  const again = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: '2026-00123', lastName: 'Dizon', firstName: 'Maria', year: '4' } });
  assert.equal(again.status, 201);
  assert.equal(again.data.patient.reEnrolled, true);
  assert.deepEqual(await roster(now.id), ['2026-00123']);
  assert.deepEqual(await roster(past.id), ['2026-00123']);

  const kept = (await get(f, f.nurse, '2026-00123')).data.requirements;
  assert.equal(kept.completed, 3);                                  // nothing was reset
  assert.equal((await f.request('/api/patients/2026-00123/history', { actor: f.nurse })).data.history.asthma, true);
});
