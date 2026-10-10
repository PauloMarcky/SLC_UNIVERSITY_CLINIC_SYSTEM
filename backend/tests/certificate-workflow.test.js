import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClinicServer } from '../app.js';
import { pool, resetDatabase, closePool } from '../db.js';

after(async () => {
  await closePool();
});

const PASSWORD = 'A-long-disposable-test-password';
const draft = {
  patientId: '2026-00123', patientName: 'Maria Dizon', type: 'Medical Certificate',
  certificateDate: '2026-10-09', purpose: 'School attendance',
  findings: 'Fictional findings for automated testing.', recommendations: 'Fictional recommendation.', otherDetails: ''
};

async function fixture(t, options = {}) {
  await resetDatabase();
  let clinic = createClinicServer(options);
  const nurseUser = await clinic.createUser({ username: 'nurse.test', name: 'Nurse Test', password: PASSWORD, role: 'nurse' });
  const doctorUser = await clinic.createUser({ username: 'doctor.test', name: 'Doctor Test', password: PASSWORD, role: 'doctor' });
  await clinic.createUser({ username: 'other.nurse', name: 'Other Nurse', password: PASSWORD, role: 'nurse' });
  let base;
  async function listen() {
    await new Promise(resolve => clinic.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${clinic.server.address().port}`;
  }
  await listen();
  t.after(async () => {
    await clinic.close();
  });
  async function request(path, { actor, method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
    const response = await fetch(base + path, {
      method, redirect,
      headers: {
        ...(actor ? { Cookie: actor.cookie, 'X-CSRF-Token': actor.csrfToken } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers
      },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }
  async function login(username) {
    const result = await request('/api/login', { method: 'POST', body: { username, password: PASSWORD, role: 'doctor' } });
    assert.equal(result.status, 200);
    return { ...result.data, cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  return {
    request, login, nurseUser, doctorUser, get clinic() { return clinic; },
    async restart() { await clinic.close(); clinic = createClinicServer(options); await listen(); }
  };
}

test('complete nurse → returned revision → doctor approval → print workflow persists with immutable approvals', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  const otherNurse = await f.login('other.nurse');
  assert.equal(nurse.user.role, 'nurse', 'client-provided role must not elevate login');
  const patients = await f.request('/api/patients?search=Maria', { actor: nurse });
  assert.equal(patients.status, 200);
  assert.equal(patients.data.patients[0].id, draft.patientId);

  let result = await f.request('/api/certificates', { actor: nurse, method: 'POST', body: {
    ...draft, status: 'Approved', approvedByName: 'Forged Doctor', approvedAt: '2000-01-01', createdBy: 999, patient: { name: 'Forged snapshot' }
  } });
  assert.equal(result.status, 201);
  let certificate = result.data.certificate;
  const id = certificate.id;
  assert.equal(certificate.status, 'Draft');
  assert.equal(certificate.approvedAt, null);
  assert.equal(certificate.createdBy, nurse.user.id);
  assert.equal(certificate.patient.name, 'Maria Dizon');
  assert.ok(certificate.createdAt);
  assert.equal((await f.request(`/certificates/${id}/print`, { actor: nurse })).status, 409);
  const preview = await f.request(`/certificates/${id}/preview`, { actor: nurse });
  assert.equal(preview.status, 200);
  assert.match(preview.data, /preview|not.*official/i);

  result = await f.request(`/api/certificates/${id}`, { actor: nurse, method: 'PUT', body: { ...draft, findings: 'Updated test findings.', version: certificate.version } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  assert.equal(certificate.version, 2);
  assert.equal(certificate.updatedByName, nurse.user.name);
  assert.equal((await f.request(`/api/certificates/${id}`, { actor: nurse, method: 'PUT', body: { ...draft, version: 1 } })).status, 409);
  assert.equal((await f.request(`/api/certificates/${id}/approve`, { actor: nurse, method: 'POST', body: { version: certificate.version } })).status, 403);
  assert.equal((await f.request(`/api/certificates/${id}/approve`, { actor: doctor, method: 'POST', body: { version: certificate.version } })).status, 409);

  result = await f.request(`/api/certificates/${id}/submit`, { actor: nurse, method: 'POST', body: { version: certificate.version } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  assert.equal(certificate.status, 'Pending Approval');
  assert.equal(certificate.submittedByName, nurse.user.name);
  assert.ok(certificate.submittedAt);
  assert.equal((await f.request(`/api/certificates/${id}`, { actor: nurse, method: 'PUT', body: { ...draft, version: certificate.version } })).status, 409);
  assert.equal((await f.request(`/certificates/${id}/print`, { actor: doctor })).status, 409);
  assert.equal((await f.request(`/api/certificates/${id}/submit`, { actor: nurse, method: 'POST', body: { version: certificate.version } })).status, 409);
  const doctorNotifications = await f.request('/api/notifications', { actor: doctor });
  assert.equal(doctorNotifications.data.notifications.length, 1);
  assert.equal(doctorNotifications.data.notifications[0].certificateId, id);
  assert.equal((await f.request(`/api/notifications/${doctorNotifications.data.notifications[0].id}/read`, { actor: nurse, method: 'POST', body: {} })).status, 404);
  assert.equal((await f.request(`/api/notifications/${doctorNotifications.data.notifications[0].id}/read`, { actor: doctor, method: 'POST', body: {} })).status, 200);
  assert.equal((await f.request(`/api/certificates/${id}/return`, { actor: doctor, method: 'POST', body: { version: certificate.version, remarks: ' ' } })).status, 400);

  result = await f.request(`/api/certificates/${id}/return`, { actor: doctor, method: 'POST', body: { version: certificate.version, remarks: 'Please clarify the findings.' } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  assert.equal(certificate.status, 'Returned for Revision');
  assert.equal(certificate.remarks, 'Please clarify the findings.');
  assert.equal((await f.request(`/certificates/${id}/print`, { actor: nurse })).status, 409);
  assert.equal((await f.request('/api/notifications', { actor: nurse })).data.notifications.length, 1);
  assert.equal((await f.request('/api/notifications', { actor: otherNurse })).data.notifications.length, 0);
  result = await f.request(`/api/certificates/${id}`, { actor: nurse, method: 'PUT', body: { ...draft, findings: 'Clarified findings.', version: certificate.version } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  result = await f.request(`/api/certificates/${id}/submit`, { actor: nurse, method: 'POST', body: { version: certificate.version } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  const pendingVersion = certificate.version;
  result = await f.request(`/api/certificates/${id}/approve`, { actor: doctor, method: 'POST', body: { version: pendingVersion, approvedByName: 'Spoof', approvedAt: '2000-01-01' } });
  assert.equal(result.status, 200);
  certificate = result.data.certificate;
  assert.equal(certificate.status, 'Approved');
  assert.equal(certificate.approvedByName, 'Doctor Test');
  assert.equal(certificate.approvedBy, doctor.user.id);
  assert.ok(Date.parse(certificate.approvedAt));
  assert.equal((await f.request(`/api/certificates/${id}/return`, { actor: doctor, method: 'POST', body: { version: pendingVersion, remarks: 'Stale action' } })).status, 409);
  assert.equal((await f.request(`/api/certificates/${id}/approve`, { actor: doctor, method: 'POST', body: { version: certificate.version } })).status, 409);
  assert.equal((await f.request(`/api/certificates/${id}`, { actor: nurse, method: 'PUT', body: { ...draft, version: certificate.version } })).status, 409);
  for (const actor of [nurse, doctor]) {
    const print = await f.request(`/certificates/${id}/print`, { actor });
    assert.equal(print.status, 200);
    assert.match(print.data, /Doctor Test/);
    assert.match(print.data, /signature/i);
    assert.match(print.data, /A4/i);
    assert.equal(print.headers.get('cache-control'), 'no-store');
  }
  await assert.rejects(
    pool.execute('UPDATE certificates SET findings=? WHERE id=?', ['Tampered', id]),
    /immutable/
  );
  const history = (await f.request(`/api/certificates/${id}`, { actor: doctor })).data.history;
  assert.deepEqual(history.map(event => event.action), ['Created', 'Edited', 'Submitted for approval', 'Returned for revision', 'Edited', 'Submitted for approval', 'Approved']);
  assert.ok(history.every(event => event.actorName && event.createdAt));
  assert.equal(history[3].remarks, 'Please clarify the findings.');
  assert.equal((await f.request('/api/notifications', { actor: nurse })).data.notifications.length, 2);

  result = await f.request(`/api/certificates/${id}/revise`, { actor: nurse, method: 'POST', body: { version: certificate.version } });
  assert.equal(result.status, 201);
  const revision = result.data.certificate;
  assert.equal(revision.status, 'Draft');
  assert.equal(revision.revisedFromId, id);
  assert.equal(revision.approvedAt, null);
  assert.equal(revision.findings, certificate.findings);
  assert.equal((await f.request(`/certificates/${revision.id}/print`, { actor: nurse })).status, 409);
  assert.equal((await f.request(`/api/certificates/${id}`, { actor: nurse })).data.certificate.status, 'Approved');
  await f.restart();
  const persisted = await f.request(`/api/certificates/${id}`, { actor: nurse });
  assert.equal(persisted.status, 200, 'sessions and certificate records survive restart');
  assert.deepEqual(persisted.data.certificate, certificate);
  assert.equal(persisted.data.history.length, 7);
  assert.equal((await f.request('/api/notifications', { actor: doctor })).data.notifications[1].readAt !== null, true);
});

test('authentication, CSRF, roles, static source boundaries and logout are enforced on the server', async t => {
  const f = await fixture(t);
  for (const path of ['/api/session', '/api/patients', '/api/certificates', '/api/notifications', '/certificates/1/preview', '/certificates/1/print']) {
    assert.equal((await f.request(path)).status, 401, path);
  }
  const invalid = await f.request('/api/login', { method: 'POST', body: { username: 'nurse.test', password: 'wrong' } });
  assert.equal(invalid.status, 401);
  const crossOrigin = await f.request('/api/login', { method: 'POST', body: { username: 'nurse.test', password: PASSWORD }, headers: { Origin: 'https://evil.example' } });
  assert.equal(crossOrigin.status, 403);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  assert.equal((await f.request('/api/session', { actor: nurse })).data.user.role, 'nurse');
  assert.equal((await f.request('/api/certificates', { actor: nurse, method: 'POST', body: draft, headers: { 'X-CSRF-Token': '' } })).status, 403);
  assert.equal((await f.request('/api/certificates', { actor: nurse, method: 'POST', body: draft, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/api/certificates', { actor: doctor, method: 'POST', body: draft })).status, 403);
  const certificate = (await f.request('/api/certificates', { actor: nurse, method: 'POST', body: draft })).data.certificate;
  assert.equal((await f.request(`/api/certificates/${certificate.id}`, { actor: doctor, method: 'PUT', body: { ...draft, version: certificate.version } })).status, 403);
  assert.equal((await f.request(`/api/certificates/${certificate.id}/submit`, { actor: doctor, method: 'POST', body: { version: certificate.version } })).status, 403);
  assert.equal((await f.request(`/api/certificates/${certificate.id}/return`, { actor: nurse, method: 'POST', body: { version: certificate.version, remarks: 'Spoofed role' } })).status, 403);
  for (const path of ['/server/app.js', '/Server/app.js', '/tests/certificate-workflow.test.js', '/data/clinic.sqlite', '/package.json', '/.git/config', '/%2Egit/config']) {
    assert.equal((await f.request(path, { actor: nurse })).status, 404, path);
  }
  for (const path of ['/doctor/dashboard.html', '/Doctor/dashboard.html']) assert.equal((await f.request(path, { actor: nurse })).status, 403);
  assert.equal((await f.request('/nurse/dashboard.html', { actor: doctor })).status, 403);
  assert.equal((await f.request('/shared/certificates.html')).status, 302);
  assert.equal((await f.request('/api/logout', { actor: nurse, method: 'POST', body: {} })).status, 200);
  assert.equal((await f.request('/api/session', { actor: nurse })).status, 401);
  assert.equal((await f.request('/api/certificates', { actor: nurse })).status, 401);
});

test('validation rejects malformed JSON, dates, missing patients and oversized fields without records', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  for (const body of [
    [], null, 'not json',
    { ...draft, patientId: 'missing' },
    { ...draft, patientId: 123 },
    { ...draft, patientName: '' },
    { ...draft, type: 'Injected type' },
    { ...draft, certificateDate: '2026-02-30' },
    { ...draft, certificateDate: 'Infinity' },
    { ...draft, certificateDate: 'NaN' },
    { ...draft, certificateDate: '0000-99-99' },
    { ...draft, purpose: 'x'.repeat(1001) },
    { ...draft, findings: {} }
  ]) {
    const result = await f.request('/api/certificates', { actor: nurse, method: 'POST', body });
    assert.equal(result.status, 400, JSON.stringify(body).slice(0, 100));
  }
  assert.equal((await f.request('/api/certificates', { actor: nurse })).data.certificates.length, 0);
  const certificate = (await f.request('/api/certificates', { actor: nurse, method: 'POST', body: { ...draft, purpose: '', findings: '' } })).data.certificate;
  assert.equal((await f.request(`/api/certificates/${certificate.id}/submit`, { actor: nurse, method: 'POST', body: { version: certificate.version } })).status, 400);
  assert.equal((await f.request(`/api/certificates/${certificate.id}`, { actor: nurse, method: 'PUT', body: { ...draft } })).status, 409);
  assert.equal((await f.request('/api/certificates?status=Invalid', { actor: nurse })).status, 400);
  assert.equal((await f.request('/api/patients?search=%27%20OR%201%3D1', { actor: nurse })).data.patients.length, 0);
});

test('simultaneous approve and return requests produce one transition, audit entry and notification', async t => {
  const f = await fixture(t);
  const nurse = await f.login('nurse.test');
  const doctor = await f.login('doctor.test');
  let certificate = (await f.request('/api/certificates', { actor: nurse, method: 'POST', body: draft })).data.certificate;
  certificate = (await f.request(`/api/certificates/${certificate.id}/submit`, { actor: nurse, method: 'POST', body: { version: certificate.version } })).data.certificate;
  const results = await Promise.all([
    f.request(`/api/certificates/${certificate.id}/approve`, { actor: doctor, method: 'POST', body: { version: certificate.version } }),
    f.request(`/api/certificates/${certificate.id}/return`, { actor: doctor, method: 'POST', body: { version: certificate.version, remarks: 'Concurrent request' } })
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((await f.request(`/api/certificates/${certificate.id}`, { actor: nurse })).data.history.length, 3);
  assert.equal((await f.request('/api/notifications', { actor: nurse })).data.notifications.length, 1);
});

test('login attempts are rate limited and deactivated accounts lose existing access', async t => {
  const f = await fixture(t, { loginAttemptLimit: 3 });
  const nurse = await f.login('nurse.test');
  await pool.execute('UPDATE users SET active=0 WHERE id=?', [nurse.user.id]);
  assert.equal((await f.request('/api/session', { actor: nurse })).status, 401);
  for (let index = 0; index < 2; index++) assert.equal((await f.request('/api/login', { method: 'POST', body: { username: 'missing', password: 'incorrect' } })).status, 401);
  assert.equal((await f.request('/api/login', { method: 'POST', body: { username: 'doctor.test', password: PASSWORD } })).status, 429);
});