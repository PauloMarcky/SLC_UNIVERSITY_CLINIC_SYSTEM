import { HttpError } from '../utils/http-error.js';

/**
 * Route-level role gate: requireRole(['doctor'], 'Only a doctor can ...').
 * Services repeat the sensitive checks so they stay safe if a route is wired wrong.
 */
export function requireRole(roles, message = 'You do not have access to this.') {
  return function roleGate(req, res, next) {
    if (!roles.includes(req.session.user.role)) throw new HttpError(403, message);
    next();
  };
}
