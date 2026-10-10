import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, HttpError, STATUSES, verifyPassword, passwordHash } from './store.js';
import { renderCertificate } from './certificate-template.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_AGE = 8 * 60 * 60 * 1000;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function tokenHash(value) { return createHash('sha256').update(value).digest('hex'); }
function sameToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Use application/json for this request.');
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A JSON object is required.');
  return value;
}

function idFrom(value) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new HttpError(404, 'Record not found.');
  return Number(value);
}

/** Creates an HTTP server without binding a port, so tests can use an isolated DB. */
export function createClinicServer(options = {}) {
  const publicRoot = resolve(options.publicRoot || PROJECT_ROOT);
  const store = openStore(options.dbPath || resolve(PROJECT_ROOT, 'data', 'clinic.sqlite'));
  const { db } = store;
  const secureCookie = options.secureCookie ?? process.env.COOKIE_SECURE === 'true';
  const config = {
    universityName: 'Saint Louis College', clinicName: 'University Clinic',
    ...(options.config || {})
  };
  const loginAttempts = new Map();
  const maximumAttempts = options.loginAttemptLimit ?? 30;
  const dummyHash = passwordHash(randomBytes(32).toString('hex'));

  function session(request) {
    const match = (request.headers.cookie || '').match(/(?:^|;\s*)clinic_session=([a-f0-9]{64})(?:;|$)/);
    if (!match) return null;
    const row = db.prepare(`SELECT sessions.*,users.id,users.username,users.name,users.role
      FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE token_hash=? AND expires_at>? AND users.active=1`).get(tokenHash(match[1]), Date.now());
    if (!row) return null;
    return { user: { id: row.id, username: row.username, name: row.name, role: row.role }, csrfToken: row.csrf_token, tokenHash: row.token_hash };
  }

  function requireSession(request) {
    const current = session(request);
    if (!current) throw new HttpError(401, 'Authentication required.');
    if (!['nurse', 'doctor'].includes(current.user.role)) throw new HttpError(403, 'Clinic staff access required.');
    return current;
  }

  function verifyOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
    const origin = request.headers.origin;
    if (!origin) return;
    let parsed;
    try { parsed = new URL(origin); } catch { throw new HttpError(403, 'Invalid request origin.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== request.headers.host || parsed.pathname !== '/') throw new HttpError(403, 'Cross-site requests are not allowed.');
    if (options.allowedOrigin && parsed.origin !== options.allowedOrigin) throw new HttpError(403, 'Cross-site requests are not allowed.');
  }

  function verifyMutation(request, current) {
    verifyOrigin(request);
    if (!sameToken(request.headers['x-csrf-token'], current.csrfToken)) throw new HttpError(403, 'Invalid CSRF token. Reload the page and try again.');
  }

  function cookie(value, clear = false) {
    return `clinic_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_AGE / 1000}${secureCookie ? '; Secure' : ''}`;
  }

  function rateLimit(request) {
    const key = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [address, attempt] of loginAttempts) if (attempt.until < now) loginAttempts.delete(address);
    let attempt = loginAttempts.get(key);
    if (!attempt) { attempt = { count: 0, until: now + 10 * 60 * 1000 }; loginAttempts.set(key, attempt); }
    if (attempt.count >= maximumAttempts) throw new HttpError(429, 'Too many login attempts. Try again in ten minutes.');
    attempt.count += 1;
  }

  async function api(request, response, url) {
    const path = url.pathname;
    const method = request.method;
    if (path === '/api/login' && method === 'POST') {
      verifyOrigin(request);
      rateLimit(request);
      const body = await readJson(request);
      if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 200) throw new HttpError(400, 'Enter a valid username and password.');
      const user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1').get(body.username.trim());
      if (!verifyPassword(body.password, user?.password_hash || dummyHash) || !user) throw new HttpError(401, 'Invalid username or password.');
      const token = randomBytes(32).toString('hex');
      const csrfToken = randomBytes(32).toString('hex');
      const previous = session(request);
      store.transaction(() => {
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
        if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(previous.tokenHash);
        db.prepare('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(tokenHash(token), user.id, csrfToken, Date.now() + SESSION_AGE);
      });
      return json(response, 200, { user: { id: user.id, username: user.username, name: user.name, role: user.role }, csrfToken }, { 'Set-Cookie': cookie(token) });
    }
    const current = requireSession(request);
    if (!['GET', 'HEAD'].includes(method)) verifyMutation(request, current);
    if (path === '/api/session' && method === 'GET') return json(response, 200, { user: current.user, csrfToken: current.csrfToken });
    if (path === '/api/logout' && method === 'POST') {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(current.tokenHash);
      return json(response, 200, { ok: true }, { 'Set-Cookie': cookie('', true) });
    }
    if (path === '/api/patients' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').trim().slice(0, 200);
      const patients = db.prepare(`SELECT id,name,college,course,year,category FROM patients
        WHERE instr(lower(name),lower(?))>0 OR instr(lower(id),lower(?))>0 ORDER BY name LIMIT 100`).all(search, search);
      return json(response, 200, { patients });
    }
    if (path === '/api/certificates') {
      if (method === 'GET') {
        const status = url.searchParams.get('status');
        if (status && !Object.values(STATUSES).includes(status)) throw new HttpError(400, 'Invalid certificate status.');
        const rows = status ? db.prepare('SELECT * FROM certificates WHERE status=? ORDER BY updated_at DESC,id DESC').all(status) : db.prepare('SELECT * FROM certificates ORDER BY updated_at DESC,id DESC').all();
        return json(response, 200, { certificates: rows.map(store.certificate) });
      }
      if (method === 'POST') return json(response, 201, { certificate: store.createCertificate(await readJson(request), current.user) });
    }
    const certMatch = path.match(/^\/api\/certificates\/(\d+)(?:\/(submit|approve|return|revise))?$/);
    if (certMatch) {
      const id = idFrom(certMatch[1]);
      const action = certMatch[2];
      if (!action && method === 'GET') {
        const certificate = store.getCertificate(id);
        const history = db.prepare(`SELECT id,action,actor_id AS actorId,actor_name AS actorName,
          created_at AS createdAt,remarks,certificate_version AS version
          FROM certificate_history WHERE certificate_id=? ORDER BY id`).all(id);
        return json(response, 200, { certificate, history });
      }
      if (!action && method === 'PUT') return json(response, 200, { certificate: store.updateCertificate(id, await readJson(request), current.user) });
      if (action && method === 'POST') return json(response, action === 'revise' ? 201 : 200, { certificate: store.transition(id, action, await readJson(request), current.user) });
    }
    if (path === '/api/notifications' && method === 'GET') {
      const notifications = db.prepare(`SELECT id,message,certificate_id AS certificateId,created_at AS createdAt,read_at AS readAt
        FROM notifications WHERE recipient_id=? ORDER BY id DESC LIMIT 100`).all(current.user.id);
      return json(response, 200, { notifications });
    }
    const notificationMatch = path.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notificationMatch && method === 'POST') {
      const result = db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=?').run(new Date().toISOString(), idFrom(notificationMatch[1]), current.user.id);
      if (!result.changes) throw new HttpError(404, 'Notification not found.');
      return json(response, 200, { ok: true });
    }
    throw new HttpError(404, 'API endpoint not found.');
  }

  async function staticFile(request, response, url) {
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Invalid URL.'); }
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('\\') || pathname.includes('\0')) throw new HttpError(404, 'File not found.');
    const parts = pathname.split('/').filter(Boolean);
    if (parts.some(part => part.startsWith('.')) || parts.some(part => ['server', 'tests', 'data', 'node_modules', 'docs'].includes(part.toLowerCase()))) throw new HttpError(404, 'File not found.');
    const filePath = resolve(publicRoot, '.' + pathname);
    if (!filePath.startsWith(publicRoot + sep)) throw new HttpError(404, 'File not found.');
    const extension = extname(filePath).toLowerCase();
    if (!CONTENT_TYPES[extension]) throw new HttpError(404, 'File not found.');
    const restricted = { '/doctor-dashboard.html': 'doctor', '/nurse-dashboard.html': 'nurse', '/certificates.html': 'staff' };
    const restrictedRole = restricted[pathname.toLowerCase()];
    if (restrictedRole) {
      const current = session(request);
      if (!current) { response.writeHead(302, { Location: '/index.html' }); response.end(); return; }
      if (restrictedRole !== 'staff' && current.user.role !== restrictedRole) throw new HttpError(403, 'This dashboard is restricted to its assigned role.');
    }
    let content;
    try { if (!(await stat(filePath)).isFile()) throw new Error('Not a file'); content = await readFile(filePath); }
    catch { throw new HttpError(404, 'File not found.'); }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension] });
    response.end(request.method === 'HEAD' ? undefined : content);
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(request, response, url);
      const printMatch = url.pathname.match(/^\/certificates\/(\d+)\/(print|preview)$/);
      if (printMatch && request.method === 'GET') {
        requireSession(request);
        const certificate = store.getCertificate(idFrom(printMatch[1]));
        const official = printMatch[2] === 'print';
        if (official && certificate.status !== STATUSES.APPROVED) throw new HttpError(409, 'Only doctor-approved certificates can be printed.');
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderCertificate(certificate, config, { official }));
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      await staticFile(request, response, url);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      if (!(error instanceof HttpError)) options.onError?.(error);
      json(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'The request could not be completed.' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return {
    server, db, createUser: store.createUser,
    close: async () => {
      if (server.listening) await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
      db.close();
    }
  };
}
