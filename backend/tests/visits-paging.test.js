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

const TODAY = new Date().toISOString().slice(0, 10);

// One completed visit: the nurse triages it, the doctor completes it.
async function visit(f, nurse, doctor, { patientId, visitType, weight = 60, diagnosis = 'Test diagnosis', ...complete }) {
  const triage = await f.request('/api/visits/triage', { actor: nurse, method: 'POST', body: {
    patientId, visitType, visitDate: TODAY, complaint: 'Test complaint', bp: '118/76', weight, height: 165 } });
  assert.equal(triage.status, 201);
  const done = await f.request(`/api/visits/${triage.data.visit.id}/complete`, { actor: doctor, method: 'POST',
    body: { diagnosis, soapObjective: 'Findings', actionsTaken: 'Advice', ...complete } });
  assert.equal(done.status, 200);
  return done.data.visit.id;
}

test('visit logs: paging, filters, totals and confidential rules', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');

  // 7 completed visits: 4 checkups (one also in Screening), 3 consultations (one sent to hospital, one confidential).
  const ids = [];
  ids.push(await visit(f, nurse, doctor, { patientId: '2026-00123', visitType: 'Checkup', putToScreening: true, screenedNote: 'Check' }));
  ids.push(await visit(f, nurse, doctor, { patientId: '2026-00123', visitType: 'Consultation', sentToHospital: true }));
  ids.push(await visit(f, nurse, doctor, { patientId: '2025-00456', visitType: 'Checkup', weight: 40 }));   // BMI 14.7 Underweight
  ids.push(await visit(f, nurse, doctor, { patientId: '2025-00456', visitType: 'Consultation' }));
  ids.push(await visit(f, nurse, doctor, { patientId: '2024-00789', visitType: 'Checkup', weight: 90 }));   // BMI 33.1 Obese
  ids.push(await visit(f, nurse, doctor, { patientId: '2024-00789', visitType: 'Consultation', confidential: true }));
  ids.push(await visit(f, nurse, doctor, { patientId: 'E-0098', visitType: 'Checkup' }));
  const [maria, mariaHosp, paoloLow, , angelaObese, angelaHidden] = ids;
  const list = (path, actor = doctor) => f.request(path, { actor });
  const idsOf = result => result.data.visits.map(v => v.id);

  // Without paging options the answer is the old one: the newest rows, no total.
  const plain = await list('/api/visits');
  assert.equal(plain.status, 200);
  assert.equal(plain.data.visits.length, 8);          // 7 visits + 1 screening copy
  assert.equal(plain.data.total, undefined);

  // Pages: no overlap, a short last page, and an empty page past the end. The total never changes.
  const p1 = await list('/api/visits?page=1&pageSize=3');
  const p2 = await list('/api/visits?page=2&pageSize=3');
  const p3 = await list('/api/visits?page=3&pageSize=3');
  const p4 = await list('/api/visits?page=4&pageSize=3');
  assert.deepEqual([p1, p2, p3, p4].map(r => r.status), [200, 200, 200, 200]);
  assert.deepEqual([p1, p2, p3, p4].map(r => r.data.visits.length), [3, 3, 2, 0]);
  assert.deepEqual([p1, p2, p3, p4].map(r => r.data.total), [8, 8, 8, 8]);
  assert.equal(p2.data.page, 2);
  assert.equal(p2.data.pageSize, 3);
  assert.deepEqual([...idsOf(p1), ...idsOf(p2), ...idsOf(p3)].sort((a, b) => a - b), plain.data.visits.map(v => v.id).sort((a, b) => a - b));
  assert.deepEqual([...idsOf(p1), ...idsOf(p2), ...idsOf(p3)], idsOf(plain));   // same order as the unpaged list
  assert.equal((await list('/api/visits?page=1')).data.pageSize, 50);            // default page size
  assert.equal((await list('/api/visits?pageSize=99999')).data.pageSize, 2000);  // capped

  // Bad values are refused.
  for (const bad of ['page=0', 'page=abc', 'page=1.5', 'pageSize=0', 'pageSize=-4', 'from=17-10-2026', 'from=x', 'bmi=Huge']) {
    assert.equal((await list('/api/visits?' + bad)).status, 400, bad);
  }

  // Type, screened copies, BMI, hospital and date filters; each total counts every match, not one page.
  const checkups = await list('/api/visits?type=Checkup&page=1&pageSize=2');
  assert.equal(checkups.data.total, 5);               // 4 checkups + 1 screening copy
  const originals = await list('/api/visits?type=Checkup&excludeScreenedCopies=1&page=1&pageSize=2');
  assert.equal(originals.data.total, 4);
  assert.equal(originals.data.visits.length, 2);
  assert.ok(originals.data.visits.every(v => v.screenedCopyOf === null));
  assert.deepEqual(idsOf(await list('/api/visits?bmi=Underweight&page=1&pageSize=10')), [paoloLow]);
  assert.deepEqual(idsOf(await list('/api/visits?bmi=Obese&page=1&pageSize=10')), [angelaObese]);
  assert.deepEqual(idsOf(await list('/api/visits?sentToHospital=1&page=1&pageSize=10')), [mariaHosp]);
  assert.equal((await list(`/api/visits?from=${TODAY}&page=1&pageSize=10`)).data.total, 8);
  assert.equal((await list('/api/visits?from=2999-01-01&page=1&pageSize=10')).data.total, 0);
  // Filters combine, and search matches name or student ID.
  const combined = await list('/api/visits?search=maria&type=Consultation&sentToHospital=1&page=1&pageSize=10');
  assert.deepEqual(idsOf(combined), [mariaHosp]);
  assert.equal(combined.data.total, 1);
  assert.equal((await list('/api/visits?search=2025-00456&page=1&pageSize=10')).data.total, 2);

  // A nurse cannot find a confidential visit by searching; a doctor can. Without a search the nurse list is unchanged.
  const nurseSearch = await list('/api/visits?search=angela&page=1&pageSize=10', nurse);
  const doctorSearch = await list('/api/visits?search=angela&page=1&pageSize=10', doctor);
  assert.equal(nurseSearch.data.total, 1);
  assert.ok(!idsOf(nurseSearch).includes(angelaHidden));
  assert.equal(doctorSearch.data.total, 2);
  assert.ok(idsOf(doctorSearch).includes(angelaHidden));

  // Screening has the same options, and the same rule for hidden patients.
  const screened = await list('/api/visits/screened?page=1&pageSize=1');
  assert.equal(screened.status, 200);
  assert.equal(screened.data.total, 1);
  assert.equal(screened.data.visits[0].screenedCopyOf, maria);
  assert.equal((await list('/api/visits/screened?page=2&pageSize=1')).data.visits.length, 0);
  assert.equal((await list('/api/visits/screened?search=nobody&page=1&pageSize=5', nurse)).data.total, 0);
  assert.equal((await list('/api/visits/screened?search=maria&page=1&pageSize=5', nurse)).data.total, 1);
  assert.equal((await list('/api/visits/screened?bmi=Obese&page=1&pageSize=5')).data.total, 0);
  assert.equal((await list(`/api/visits/screened?from=${TODAY}`)).data.visits.length, 1);
  assert.equal((await list('/api/visits/screened?page=0')).status, 400);
  assert.equal((await f.request('/api/visits/screened?page=1')).status, 401);     // not signed in
  assert.equal((await list('/api/visits/screened')).data.total, undefined);        // old call still works
});
