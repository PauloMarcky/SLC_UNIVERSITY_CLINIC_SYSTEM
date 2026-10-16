import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../utils/http-error.js';

function sameToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rejects requests that come from another site. Used on login and on every change. */
export function originCheck(allowedOrigin) {
  return function verifyOrigin(req, res, next) {
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      throw new HttpError(403, 'Cross-site requests are not allowed.');
    }
    const origin = req.headers.origin;
    if (!origin) return next();
    let parsed;
    try { parsed = new URL(origin); } catch { throw new HttpError(403, 'Invalid request origin.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.host !== req.headers.host ||
        parsed.pathname !== '/') {
      throw new HttpError(403, 'Cross-site requests are not allowed.');
    }
    if (allowedOrigin && parsed.origin !== allowedOrigin) {
      throw new HttpError(403, 'Cross-site requests are not allowed.');
    }
    next();
  };
}

/** For POST/PUT/DELETE: origin check plus the X-CSRF-Token header tied to the session. */
export function csrfProtection(allowedOrigin) {
  const verifyOrigin = originCheck(allowedOrigin);
  return function csrf(req, res, next) {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    verifyOrigin(req, res, () => {
      if (!sameToken(req.headers['x-csrf-token'], req.session.csrfToken)) {
        throw new HttpError(403, 'Invalid CSRF token. Reload the page and try again.');
      }
      next();
    });
  };
}
