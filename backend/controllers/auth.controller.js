import { readJson, sessionCookie } from '../utils/http.js';
import { login as startSession, logout as endSession, SESSION_AGE } from '../services/auth.service.js';

export async function login(req, res) {
  const body = await readJson(req);
  const { token, csrfToken, user } = await startSession(body, req.session);
  res.status(200)
    .set('Set-Cookie', sessionCookie(token, { secure: req.app.locals.cookieSecure, maxAgeSeconds: SESSION_AGE / 1000 }))
    .json({ user, csrfToken });
}

export function session(req, res) {
  res.status(200).json({ user: req.session.user, csrfToken: req.session.csrfToken });
}

export async function logout(req, res) {
  await endSession(req.session.tokenHash);
  res.status(200)
    .set('Set-Cookie', sessionCookie('', { clear: true, secure: req.app.locals.cookieSecure }))
    .json({ ok: true });
}
