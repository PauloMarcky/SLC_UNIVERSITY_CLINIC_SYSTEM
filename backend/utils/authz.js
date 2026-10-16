// Role checks used inside services. Routes also gate by role (middleware/requireRole.js);
// the service checks stay as a second lock so a service is safe even if a route is wired wrong.
import { HttpError } from './http-error.js';

export const STAFF = ['nurse', 'doctor'];

/** Exactly one role allowed. */
export function checkRole(actor, role) {
  if (actor.role !== role) throw new HttpError(403, `Only a ${role} can perform this action.`);
}

/** Any of several roles allowed, with a custom message. */
export function requireAnyRole(actor, roles, message) {
  if (!roles.includes(actor.role)) throw new HttpError(403, message);
}
