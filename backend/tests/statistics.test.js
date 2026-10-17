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
  async function login(username, role = 'doctor') {
    const result = await request('/api/login', { method: 'POST', body: { username, password: PASSWORD, role } });
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

test('statistics summary accurately counts consultations and checkups, excluding screening copies', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test', 'nurse');
  const doctor = await f.login('doctor.test', 'doctor');

  // Complete one Consultation with a specific diagnosis
  const consultRes = await f.request('/api/visits/triage', {
    actor: nurse,
    method: 'POST',
    body: { patientId: '2026-00123', visitType: 'Consultation', complaint: 'Fever', bp: '120/80', weight: 65, height: 170, visitDate: localToday() }
  });
  await f.request(`/api/visits/${consultRes.data.visit.id}/complete`, {
    actor: doctor,
    method: 'POST',
    body: { diagnosis: 'Acute Pharyngitis' }
  });

  // Complete a Checkup that is Cleared
  const checkup1 = await f.request('/api/visits/triage', {
    actor: nurse,
    method: 'POST',
    body: { patientId: '2026-00123', visitType: 'Checkup', visitDate: localToday() }
  });
  await f.request(`/api/visits/${checkup1.data.visit.id}/complete`, {
    actor: doctor,
    method: 'POST',
    body: { diagnosis: 'Healthy', checkupResult: 'Cleared' }
  });

  // Complete a Checkup that Needs screening (creates a screening copy)
  const checkup2 = await f.request('/api/visits/triage', {
    actor: nurse,
    method: 'POST',
    body: { patientId: '2026-00123', visitType: 'Checkup', visitDate: localToday() }
  });
  await f.request(`/api/visits/${checkup2.data.visit.id}/complete`, {
    actor: doctor,
    method: 'POST',
    body: { diagnosis: 'Hypertension', checkupResult: 'Needs screening', screenedNote: 'Elevated BP' }
  });

  // Check statistics summary
  const summaryRes = await f.request('/api/statistics/summary', { actor: doctor });
  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.data.summary.totalVisits, 3); // 1 consult + 2 checkups (screening copy excluded!)
  assert.equal(summaryRes.data.summary.consultations, 1);
  assert.equal(summaryRes.data.summary.checkups, 2);
  assert.equal(summaryRes.data.summary.checkupOutcomes.cleared, 1);
  assert.equal(summaryRes.data.summary.checkupOutcomes.needsScreening, 1);
  assert.equal(summaryRes.data.summary.checkupOutcomes.screeningRatePct, 50);
  assert.equal(summaryRes.data.summary.totalScreeningCopies, 1);
});

test('morbidity report groups diagnoses by case frequency and percentage', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test', 'nurse');
  const doctor = await f.login('doctor.test', 'doctor');

  // Add 2 cases of Acute Bronchitis and 1 case of Migraine
  for (const diag of ['Acute Bronchitis', 'Acute Bronchitis', 'Migraine']) {
    const v = await f.request('/api/visits/triage', {
      actor: nurse,
      method: 'POST',
      body: { patientId: '2026-00123', visitType: 'Consultation', complaint: 'Illness', bp: '120/80', weight: 60, height: 165, visitDate: localToday() }
    });
    await f.request(`/api/visits/${v.data.visit.id}/complete`, {
      actor: doctor,
      method: 'POST',
      body: { diagnosis: diag }
    });
  }

  const morbidityRes = await f.request('/api/statistics/morbidity', { actor: nurse });
  assert.equal(morbidityRes.status, 200);
  assert.equal(morbidityRes.data.morbidity.totalCases, 3);
  assert.equal(morbidityRes.data.morbidity.items[0].diagnosis, 'Acute Bronchitis');
  assert.equal(morbidityRes.data.morbidity.items[0].caseCount, 2);
  assert.equal(morbidityRes.data.morbidity.items[0].percentage, 66.7);
  assert.equal(morbidityRes.data.morbidity.items[1].diagnosis, 'Migraine');
  assert.equal(morbidityRes.data.morbidity.items[1].caseCount, 1);
  assert.equal(morbidityRes.data.morbidity.items[1].percentage, 33.3);
});

test('demographic distribution (Dstrbtn) returns college and lab center breakdown', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test', 'nurse');
  const doctor = await f.login('doctor.test', 'doctor');

  const v = await f.request('/api/visits/triage', {
    actor: nurse,
    method: 'POST',
    body: { 
      patientId: '2026-00123', 
      visitType: 'Consultation', 
      complaint: 'Flu', 
      bp: '120/80', 
      weight: 60, 
      height: 165, 
      visitDate: localToday(),
      labSourceName: 'St. Jude Diagnostics'
    }
  });
  await f.request(`/api/visits/${v.data.visit.id}/complete`, {
    actor: doctor,
    method: 'POST',
    body: { diagnosis: 'Influenza' }
  });

  const distRes = await f.request('/api/statistics/distribution', { actor: doctor });
  assert.equal(distRes.status, 200);
  assert.ok(distRes.data.distribution.byCollege.length >= 1);
  const lab = distRes.data.distribution.externalLabSources.find(l => l.sourceName === 'St. Jude Diagnostics');
  assert.ok(lab);
  assert.equal(lab.count, 1);
});

test('exportStatisticsCsv generates valid downloadable CSV string', async t => {
  const f = await fixture(t);
  const doctor = await f.login('doctor.test', 'doctor');
  const exportRes = await f.request('/api/statistics/export', { actor: doctor });
  assert.equal(exportRes.status, 200);
  assert.ok(exportRes.data.includes('--- UNIVERSITY CLINIC HEALTH SURVEILLANCE REPORT ---'));
  assert.ok(exportRes.data.includes('--- MORBIDITY / DIAGNOSIS RANKING ---'));
  assert.ok(exportRes.data.includes('--- DISTRIBUTION (DSTRBTN) BY COLLEGE ---'));
});