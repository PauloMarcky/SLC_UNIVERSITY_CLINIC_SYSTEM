import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { HttpError, verifyPassword, passwordHash } from '../store.js';

const dummyHash = passwordHash('dummy-password-hash');
const SESSION_AGE = 8 * 60 * 60 * 1000;

export async function login(req, res, next) {
  try {
    const body = req.body || {};
    if (typeof body.username !== 'string' || typeof body.password !== 'string' ||
        body.username.length > 100 || body.password.length > 200) {
      throw new HttpError(400, 'Enter a valid username and password.');
    }
    const [userRows] = await pool.execute(
      'SELECT * FROM users WHERE username = ? AND active = 1',
      [body.username.trim()]
    );
    const user = userRows[0];
    if (!verifyPassword(body.password, user?.password_hash || dummyHash) || !user) {
      throw new HttpError(401, 'Invalid username or password.');
    }
    if (typeof body.portal === 'string' && body.portal !== user.role) {
      const portalName = body.portal.charAt(0).toUpperCase() + body.portal.slice(1);
      const actualName = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      throw new HttpError(403, `This is the ${portalName} portal. Your account is registered as a ${actualName}. Please use the ${actualName} portal.`);
    }
    const token = req.app.locals.generateToken();
    const csrfToken = req.app.locals.generateToken();
    const previous = req.session;
    await req.app.locals.withTransaction(async connection => {
      await connection.execute('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
      if (previous) {
        await connection.execute('DELETE FROM sessions WHERE token_hash = ?', [previous.tokenHash]);
      }
      await connection.execute(
        'INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES(?,?,?,?)',
        [req.app.locals.tokenHash(token), user.id, csrfToken, Date.now() + SESSION_AGE]
      );
    });
    res.setHeader('Set-Cookie', req.app.locals.makeCookie(token));
    res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role }, csrfToken });
  } catch (err) {
    next(err);
  }
}

export async function getSession(req, res, next) {
  if (!req.session) return next(new HttpError(401, 'Authentication required.'));
  res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
}

export async function logout(req, res, next) {
  try {
    if (req.session) {
      await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [req.session.tokenHash]);
    }
    res.setHeader('Set-Cookie', req.app.locals.makeCookie('', true));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}