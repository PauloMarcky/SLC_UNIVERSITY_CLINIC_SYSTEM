import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClinicServer } from '../app.js';
import { resetDatabase, closePool } from '../db/pool.js';
import { clinicToday, daysBefore } from '../utils/clinic-date.js';

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
const TRIAGE = { patientId: '2026-00123', visitType: 'Consultation', complaint: 'Cough', bp: '118/76', weight: 60, height: 165 };

test('did not proceed: re-queue inside the window, saved as missed after it', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const triage = (date, extra = {}) => f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitDate: date, ...extra } });
  const queue = async () => (await f.request('/api/visits/queue', { actor: doctor })).data;

  // Triaged yesterday and never examined: out of today's list, in "did not proceed", can be re-queued.
  const yesterday = daysBefore(TODAY, 1);
  const a = (await triage(yesterday)).data.visit;
  let q = await queue();
  assert.equal(q.windowDays, 2);
  assert.deepEqual(q.visits, []);
  assert.deepEqual(q.didNotProceed.map(v => v.id), [a.id]);
  assert.equal(q.didNotProceed[0].canRequeue, true);

  // Re-queue moves it to today, keeps the day the vitals were taken, and records who did it.
  const rq = await f.request(`/api/visits/${a.id}/requeue`, { actor: doctor, method: 'POST', body: {} });
  assert.equal(rq.status, 200);
  assert.equal(rq.data.visit.visitDate, TODAY);
  assert.equal(rq.data.visit.originalVisitDate, yesterday);
  assert.equal(rq.data.visit.requeuedByName, 'Doctor Test');
  assert.ok(rq.data.visit.requeuedAt);
  assert.equal(rq.data.visit.bp, '118/76');   // the vitals are kept
  q = await queue();
  assert.deepEqual(q.visits.map(v => v.id), [a.id]);
  // Already in today's queue: no double entry.
  assert.equal((await f.request(`/api/visits/${a.id}/requeue`, { actor: doctor, method: 'POST', body: {} })).status, 409);

  // Tomorrow it would be 2 days since the vitals: simulate by checking an older visit directly.
  const old = (await triage(daysBefore(TODAY, 2))).data.visit;
  q = await queue();
  assert.ok(!q.visits.some(v => v.id === old.id) && !q.didNotProceed.some(v => v.id === old.id));
  const refused = await f.request(`/api/visits/${old.id}/requeue`, { actor: doctor, method: 'POST', body: {} });
  assert.equal(refused.status, 409);
  assert.equal((await f.request(`/api/visits/${old.id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'x' } })).status, 409);

  // It is saved on the student record as missed, and nowhere else.
  const record = await f.request('/api/patients/2026-00123/record', { actor: nurse });
  const missed = record.data.record.visits.find(v => v.id === old.id);
  assert.equal(missed.status, 'missed');
  const log = await f.request('/api/visits', { actor: doctor });
  assert.ok(!log.data.visits.some(v => v.id === old.id), 'a missed visit is not an examined visit');
  const stats = await f.request('/api/statistics/summary', { actor: doctor });
  assert.equal(stats.status, 200);
  assert.equal(stats.data.summary.totalVisits, 0);   // nothing was examined, so nothing is counted
});

test('re-queue uses only the most recent did-not-proceed visit and blocks a second visit today', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const triage = date => f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitDate: date } });
  const yesterday = daysBefore(TODAY, 1);
  const first = (await triage(yesterday)).data.visit;
  const second = (await triage(yesterday)).data.visit;
  const q = (await f.request('/api/visits/queue', { actor: doctor })).data;
  assert.equal(q.didNotProceed.find(v => v.id === first.id).canRequeue, false);
  assert.equal(q.didNotProceed.find(v => v.id === second.id).canRequeue, true);
  assert.equal((await f.request(`/api/visits/${first.id}/requeue`, { actor: doctor, method: 'POST', body: {} })).status, 409);
  assert.equal((await f.request(`/api/visits/${second.id}/requeue`, { actor: doctor, method: 'POST', body: {} })).status, 200);
  // The patient now has a visit today, so the older one cannot be re-queued as well.
  assert.equal((await f.request(`/api/visits/${first.id}/requeue`, { actor: doctor, method: 'POST', body: {} })).status, 409);
});

test('the doctor identifies the BP status; the system never fills it in', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const v = (await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitDate: TODAY, bp: '150/95' } })).data.visit;
  assert.equal(v.bpStatus, '');
  const done = await f.request(`/api/visits/${v.id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'Elevated BP', bpStatus: 'Hypertension Stage 2' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.visit.bpStatus, 'Hypertension Stage 2');
  const w = (await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: { ...TRIAGE, visitDate: TODAY } })).data.visit;
  const doneNoBp = await f.request(`/api/visits/${w.id}/complete`, { actor: doctor, method: 'POST', body: { diagnosis: 'Cough' } });
  assert.equal(doneNoBp.data.visit.bpStatus, '');
});
