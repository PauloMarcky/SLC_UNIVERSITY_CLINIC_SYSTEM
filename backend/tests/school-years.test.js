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

test('only a doctor can change school years; nurses can read them', async t => {
  const f = await setup(t);
  const body = { label: 'Nurse try', startDate: shift(-100), endDate: shift(100) };
  assert.equal((await f.request('/api/school-years', { actor: f.nurse, method: 'POST', body })).status, 403);
  const created = await f.makeYear('Now', shift(-100), shift(100));
  assert.equal((await f.request(`/api/school-years/${created.id}`, { actor: f.nurse, method: 'PUT', body })).status, 403);
  assert.equal((await f.request(`/api/school-years/${created.id}`, { actor: f.nurse, method: 'DELETE' })).status, 403);
  const list = await f.request('/api/school-years', { actor: f.nurse });
  assert.equal(list.status, 200);
  assert.equal(list.data.schoolYears.length, 1);
  assert.equal((await f.request('/api/school-years')).status, 401);
});

test('school year dates are checked: order, length, overlap, duplicates, default name', async t => {
  const f = await setup(t);
  const post = body => f.request('/api/school-years', { actor: f.doctor, method: 'POST', body });
  assert.equal((await post({ startDate: shift(-10), endDate: shift(-10) })).status, 400);
  assert.equal((await post({ startDate: shift(-10), endDate: shift(-20) })).status, 400);
  assert.equal((await post({ startDate: shift(-1000), endDate: shift(0) })).status, 400);   // longer than 18 months
  assert.equal((await post({ startDate: 'not-a-date', endDate: shift(0) })).status, 400);
  const first = await post({ startDate: '2030-08-03', endDate: '2031-06-04' });
  assert.equal(first.status, 201);
  assert.equal(first.data.schoolYear.label, '2030-2031');       // name is filled in when left blank
  assert.equal((await post({ label: 'Clash', startDate: '2031-01-01', endDate: '2031-09-01' })).status, 409);   // overlaps
  assert.equal((await post({ label: '2030-2031', startDate: '2032-08-03', endDate: '2033-06-04' })).status, 409); // same name
});

test('visits are listed per school year; the summer break stays with the year that ended', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  const now = await f.makeYear('Now', shift(-200), shift(100));
  await f.visit(shift(-400));    // inside Past
  await f.visit(shift(-250));    // between the two years: stays with Past
  await f.visit(shift(-10));     // inside Now

  const ids = async q => (await f.request(`/api/visits${q}`, { actor: f.doctor })).data.visits.map(v => v.visitDate).sort();
  assert.deepEqual(await ids(`?schoolYear=${past.id}`), [shift(-400), shift(-250)].sort());
  assert.deepEqual(await ids(`?schoolYear=${now.id}`), [shift(-10)]);
  assert.deepEqual(await ids('?schoolYear=current'), [shift(-10)]);
  assert.equal((await ids('')).length, 3);                      // no school year = every year, nothing is lost
  assert.equal((await f.request('/api/visits?schoolYear=999999', { actor: f.doctor })).status, 404);
  assert.equal((await f.request('/api/visits?schoolYear=abc', { actor: f.doctor })).status, 400);

  // The screening log is filtered the same way.
  const t1 = await f.request('/api/visits/triage', { actor: f.nurse, method: 'POST', body: { patientId: '2026-00123', visitType: 'Checkup', visitDate: shift(-400) } });
  await f.request(`/api/visits/${t1.data.visit.id}/complete`, { actor: f.doctor, method: 'POST', body: { diagnosis: 'BP', checkupResult: 'Needs screening' } });
  assert.equal((await f.request(`/api/visits/screened?schoolYear=${past.id}`, { actor: f.doctor })).data.visits.length, 1);
  assert.equal((await f.request(`/api/visits/screened?schoolYear=${now.id}`, { actor: f.doctor })).data.visits.length, 0);
});

test('a new school year starts empty and the old year keeps its records', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  await f.visit(shift(-400));
  const now = await f.makeYear('Now', shift(-200), shift(100));

  assert.equal((await f.request('/api/visits?schoolYear=current', { actor: f.doctor })).data.visits.length, 0);
  assert.equal((await f.request(`/api/visits?schoolYear=${past.id}`, { actor: f.doctor })).data.visits.length, 1);

  const stats = async id => (await f.request(`/api/statistics/summary?schoolYear=${id}`, { actor: f.doctor })).data.summary;
  assert.equal((await stats(now.id)).totalVisits, 0);
  assert.equal((await stats(past.id)).totalVisits, 1);
  assert.equal((await stats('')).totalVisits, 1);

  const morbidity = await f.request(`/api/statistics/morbidity?schoolYear=${past.id}`, { actor: f.doctor });
  assert.equal(morbidity.data.morbidity.totalCases, 1);
  const trends = await f.request(`/api/statistics/trends?schoolYear=${now.id}`, { actor: f.doctor });
  assert.deepEqual(trends.data.trends.bmi, []);
  const csv = await f.request(`/api/statistics/export?schoolYear=${past.id}`, { actor: f.doctor });
  assert.match(csv.data, /School Year,"Past"/);
  assert.match(csv.data, /Total Visits,1/);
});

test('student list shows the last visit inside the chosen school year', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  const now = await f.makeYear('Now', shift(-200), shift(100));
  await f.visit(shift(-400));
  const lastVisit = async id => {
    const res = await f.request(`/api/patients?search=2026-00123&limit=10&offset=0&schoolYear=${id}`, { actor: f.nurse });
    assert.equal(res.status, 200);
    return res.data.patients[0].lastVisit;
  };
  assert.equal(await lastVisit(past.id), shift(-400));
  assert.equal(await lastVisit(now.id), null);            // fresh year: the student is still listed, with no visits yet
  assert.equal(await lastVisit(''), shift(-400));
});

test('editing a school year moves visits with its dates; a year with visits cannot be deleted', async t => {
  const f = await setup(t);
  const past = await f.makeYear('Past', shift(-500), shift(-300));
  const now = await f.makeYear('Now', shift(-200), shift(100));
  await f.visit(shift(-250));                                // summer break: counts as Past
  const count = async id => (await f.request(`/api/visits?schoolYear=${id}`, { actor: f.doctor })).data.visits.length;
  assert.equal(await count(past.id), 1);

  // The doctor moves the start of "Now" earlier, so it now covers that visit.
  const edit = await f.request(`/api/school-years/${now.id}`, { actor: f.doctor, method: 'PUT',
    body: { label: 'Now', startDate: shift(-260), endDate: shift(100) } });
  assert.equal(edit.status, 200);
  assert.equal(await count(now.id), 1);
  assert.equal(await count(past.id), 0);

  // Moving it so it overlaps Past is refused.
  const bad = await f.request(`/api/school-years/${now.id}`, { actor: f.doctor, method: 'PUT',
    body: { label: 'Now', startDate: shift(-400), endDate: shift(100) } });
  assert.equal(bad.status, 409);

  const del = await f.request(`/api/school-years/${now.id}`, { actor: f.doctor, method: 'DELETE' });
  assert.equal(del.status, 409);
  assert.match(del.data.error, /cannot be deleted/);
  const empty = await f.request(`/api/school-years/${past.id}`, { actor: f.doctor, method: 'DELETE' });
  assert.equal(empty.status, 200);
  assert.equal((await f.request('/api/school-years', { actor: f.doctor })).data.schoolYears.length, 1);
  assert.equal((await f.request('/api/school-years/999999', { actor: f.doctor, method: 'DELETE' })).status, 404);
});

test('after a school year ends the next one is created automatically, and its records start empty', async t => {
  const f = await setup(t);
  // Only a year that ended long ago exists; opening the list catches up to today.
  const old = await f.makeYear('Old', shift(-800), shift(-500));
  await f.visit(shift(-700));
  const list = await f.request('/api/school-years', { actor: f.doctor });
  const years = list.data.schoolYears;                         // newest first
  assert.ok(years.length >= 3, 'later years were created');
  assert.ok(years[0].endDate >= shift(0), 'the newest year has not ended yet');
  assert.equal(list.data.currentId, years.find(y => y.isCurrent).id);
  assert.equal(years.filter(y => y.isCurrent).length, 1);
  const current = years.find(y => y.isCurrent);
  assert.ok(current.startDate <= shift(0));
  assert.equal(years.find(y => y.id === old.id).visitCount >= 1, true);

  assert.equal((await f.request('/api/visits?schoolYear=current', { actor: f.doctor })).data.visits.length, 0);
  assert.equal((await f.request(`/api/visits?schoolYear=${old.id}`, { actor: f.doctor })).data.visits.length, 1);
  // Opening it again does not create more.
  const again = await f.request('/api/school-years', { actor: f.doctor });
  assert.equal(again.data.schoolYears.length, years.length);
});

test('with no school years set up, "current" shows every record', async t => {
  const f = await setup(t);
  await f.visit(shift(-5));
  assert.equal((await f.request('/api/visits?schoolYear=current', { actor: f.doctor })).data.visits.length, 1);
  const list = await f.request('/api/school-years', { actor: f.doctor });
  assert.deepEqual(list.data.schoolYears, []);
  assert.equal(list.data.currentId, null);
});
