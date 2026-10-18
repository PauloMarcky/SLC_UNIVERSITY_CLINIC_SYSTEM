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


test('every school year has its own student list; a new year starts empty', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  const now = await f.makeYear('Now', shift(-200), shift(100));

  const list = async (year, extra = '') => (await f.request(`/api/patients?search=&limit=50&offset=0&schoolYear=${year}${extra}`, { actor: f.nurse })).data;
  const ids = async year => (await list(year)).patients.map(p => p.id).sort();

  // A visit in the past year puts that student on the Past list.
  await f.visit(shift(-400));
  assert.deepEqual(await ids(past.id), ['2026-00123']);
  assert.deepEqual(await ids(now.id), []);                       // nobody enrolled yet in the current year
  const empty = await list('current');
  assert.equal(empty.total, 0);
  assert.equal(empty.all, 0);
  assert.deepEqual(empty.colleges, []);

  // Registering a new student enrolls them in the current year only.
  const added = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: 'S-1', lastName: 'Lopez', firstName: 'Ana', college: 'IT', course: 'BSIT', year: '1' } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.patient.reEnrolled, false);
  assert.deepEqual(await ids(now.id), ['S-1']);
  assert.deepEqual(await ids(past.id), ['2026-00123']);
  const dup = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: 'S-1', lastName: 'Lopez', firstName: 'Ana' } });
  assert.equal(dup.status, 409);

  // A student from an earlier year is enrolled again, with this year's course and year level.
  const again = await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: '2026-00123', lastName: 'Dizon', firstName: 'Maria', college: 'IT', course: 'BSIT', year: '4' } });
  assert.equal(again.status, 201, JSON.stringify(again.data));
  assert.equal(again.data.patient.reEnrolled, true);
  assert.deepEqual(await ids(now.id), ['2026-00123', 'S-1']);
  assert.deepEqual(await ids(past.id), ['2026-00123']);          // the old list is untouched
  const thisYear = (await list(now.id)).patients.find(p => p.id === '2026-00123');
  const lastYear = (await list(past.id)).patients.find(p => p.id === '2026-00123');
  assert.equal(thisYear.year, '4');
  assert.equal(lastYear.year, '3');                              // the year level of the old year is kept
  assert.equal((await f.request('/api/patients', { actor: f.nurse, method: 'POST', body: { id: '2026-00123', lastName: 'Dizon', firstName: 'Maria' } })).status, 409);

  // The plain picker list and "all school years" behave as documented.
  const picker = await f.request('/api/patients?search=&schoolYear=current', { actor: f.nurse });
  assert.deepEqual(picker.data.patients.map(p => p.id).sort(), ['2026-00123', 'S-1']);
  assert.equal((await list('')).all, 5);                         // no school year chosen: every student in the system

  // Checkups and consultations of the old year do not show in the new one.
  const visits = async year => (await f.request(`/api/visits?schoolYear=${year}`, { actor: f.doctor })).data.visits.length;
  assert.equal(await visits(past.id), 1);
  assert.equal(await visits(now.id), 0);
});

test('a visit puts the student on the list of the year it is dated in; years with students cannot be deleted', async t => {
  const f = await setup(t);
  const now = await f.makeYear('Now', shift(-200), shift(100));
  const ids = async () => (await f.request(`/api/patients?search=&limit=50&schoolYear=${now.id}`, { actor: f.nurse })).data.patients.map(p => p.id);
  assert.deepEqual(await ids(), []);
  await f.visit(shift(-5), '2025-00456');
  assert.deepEqual(await ids(), ['2025-00456']);
  const del = await f.request(`/api/school-years/${now.id}`, { actor: f.doctor, method: 'DELETE' });
  assert.equal(del.status, 409);
  const next = await f.makeYear('Next', shift(300), shift(600));
  assert.equal((await f.request(`/api/school-years/${next.id}`, { actor: f.doctor, method: 'DELETE' })).status, 200);
});
