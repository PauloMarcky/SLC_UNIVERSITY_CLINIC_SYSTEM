// Pure unit tests: no database and no network, so they run anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders } from '../middleware/securityHeaders.js';
import { createLoginRateLimit } from '../middleware/loginRateLimit.js';
import { requestLog } from '../middleware/requestLog.js';

function fakeResponse() {
  const headers = {};
  const listeners = {};
  return {
    headers, statusCode: 200,
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    on: (event, listener) => { listeners[event] = listener; },
    emit: event => listeners[event]?.()
  };
}

test('app pages get a strict CSP and no HSTS over plain HTTP', () => {
  const res = fakeResponse();
  securityHeaders()({ path: '/doctor/queue.html' }, res, () => {});
  assert.match(res.headers['content-security-policy'], /script-src 'self'(;|$)/);
  assert.doesNotMatch(res.headers['content-security-policy'], /script-src[^;]*unsafe-inline/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['strict-transport-security'], undefined);
});

test('HSTS is sent when the site is served over HTTPS', () => {
  const res = fakeResponse();
  securityHeaders({ hsts: true })({ path: '/' }, res, () => {});
  assert.match(res.headers['strict-transport-security'], /max-age=31536000/);
});

test('printable pages may run their own print script, nothing else may', () => {
  for (const path of ['/certificates/7/print', '/certificates/7/preview', '/prescriptions/3/print']) {
    const res = fakeResponse();
    securityHeaders()({ path }, res, () => {});
    assert.match(res.headers['content-security-policy'], /default-src 'none'/);
    assert.match(res.headers['content-security-policy'], /script-src 'unsafe-inline'/);
  }
  const api = fakeResponse();
  securityHeaders()({ path: '/api/certificates/7/print' }, api, () => {});
  assert.match(api.headers['content-security-policy'], /script-src 'self'(;|$)/);
});

test('login rate limit counts each client address separately', () => {
  const limit = createLoginRateLimit(2);
  const request = ip => ({ ip, socket: { remoteAddress: '10.0.0.1' } });
  limit(request('1.1.1.1'), {}, () => {});
  limit(request('1.1.1.1'), {}, () => {});
  assert.throws(() => limit(request('1.1.1.1'), {}, () => {}), error => error.status === 429);
  let passed = false;
  limit(request('2.2.2.2'), {}, () => { passed = true; });
  assert.equal(passed, true);
});

test('request log omits the query string', () => {
  const lines = [];
  const res = fakeResponse();
  res.statusCode = 200;
  requestLog(line => lines.push(line))({ method: 'GET', originalUrl: '/api/patients?q=Maria+Dizon' }, res, () => {});
  res.emit('finish');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /GET \/api\/patients 200 /);
  assert.doesNotMatch(lines[0], /Maria/);
});
