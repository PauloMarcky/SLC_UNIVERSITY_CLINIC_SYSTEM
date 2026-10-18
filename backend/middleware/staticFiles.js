import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { findSession } from '../services/auth.service.js';
import { HttpError } from '../utils/http-error.js';
import { STAFF } from '../utils/authz.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

// Pages that need a login (and the right role) before the HTML is even sent.
const RESTRICTED_PAGES = {
  '/doctor/dashboard.html': 'doctor',
  '/doctor/users.html': 'doctor',
  '/doctor/school-years.html': 'doctor',
  '/nurse/dashboard.html': 'nurse',
  '/shared/certificates.html': 'staff'
};
// 'archive' holds old prototype pages with dead links; it is never served.
const BLOCKED_FOLDERS = ['backend', 'server', 'tests', 'data', 'node_modules', 'docs', 'archive'];
// Every page under these folders needs a clinic-staff login before the HTML is sent.
const STAFF_FOLDERS = ['doctor', 'nurse', 'shared'];
// Images, fonts, stylesheets and scripts may be cached briefly; HTML is never cached.
const CACHEABLE = new Set(['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.ico', '.webp', '.woff', '.woff2']);

/** Serves the frontend folder. Only GET and HEAD; refuses dot files, code folders and path tricks. */
export function staticFiles(publicRootInput) {
  const publicRoot = resolve(publicRootInput);
  return async function serveStatic(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.');
    let pathname;
    try {    pathname = decodeURIComponent((req.originalPath ?? req.path).split('?')[0]); }
    catch { throw new HttpError(400, 'Invalid URL.'); }
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('\\') || pathname.includes('\0')) throw new HttpError(404, 'File not found.');
    const parts = pathname.split('/').filter(Boolean);
    if (parts.some(part => part.startsWith('.')) ||
        parts.some(part => BLOCKED_FOLDERS.includes(part.toLowerCase()))) {
      throw new HttpError(404, 'File not found.');
    }
    const filePath = resolve(publicRoot, '.' + pathname);
    if (!filePath.startsWith(publicRoot + sep)) throw new HttpError(404, 'File not found.');
    const extension = extname(filePath).toLowerCase();
    if (!CONTENT_TYPES[extension]) throw new HttpError(404, 'File not found.');

    const restrictedRole = RESTRICTED_PAGES[pathname.toLowerCase()] ||
      (extension === '.html' && STAFF_FOLDERS.includes(parts[0].toLowerCase()) ? 'staff' : null);
    if (restrictedRole) {
      const current = await findSession(req.headers.cookie);
      if (!current) { res.redirect('/index.html'); return; }
      const allowed = restrictedRole === 'staff'
        ? STAFF.includes(current.user.role)
        : current.user.role === restrictedRole;
      if (!allowed) throw new HttpError(403, 'This dashboard is restricted to its assigned role.');
    }

    let content;
    try {
      if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
      content = await readFile(filePath);
    } catch { throw new HttpError(404, 'File not found.'); }
    res.status(200).set('Content-Type', CONTENT_TYPES[extension]);
    if (CACHEABLE.has(extension)) res.set('Cache-Control', 'public, max-age=300');
    res.end(req.method === 'HEAD' ? undefined : content);
  };
}
