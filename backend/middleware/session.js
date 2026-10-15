import { findSession } from '../services/auth.service.js';
import { HttpError } from '../utils/http-error.js';
import { STAFF } from '../utils/authz.js';

/** Looks up the login cookie and sets req.session (or null). Never rejects. */
export async function attachSession(req, res, next) {
  req.session = await findSession(req.headers.cookie);
  next();
}

/** 401 when nobody is logged in. */
export function requireLogin(req, res, next) {
  if (!req.session) throw new HttpError(401, 'Authentication required.');
  next();
}

/** 403 when the account is not clinic staff (nurse or doctor). */
export function requireStaff(req, res, next) {
  if (!STAFF.includes(req.session.user.role)) throw new HttpError(403, 'Clinic staff access required.');
  next();
}
