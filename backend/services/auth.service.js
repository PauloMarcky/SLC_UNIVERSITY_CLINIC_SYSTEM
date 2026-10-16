import { createHash, randomBytes } from 'node:crypto';
import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { passwordHash, verifyPassword } from '../utils/password.js';

export const SESSION_AGE = 8 * 60 * 60 * 1000;

// Verified against when the username does not exist, so a wrong username takes as long as a wrong password.
const dummyHash = passwordHash(randomBytes(32).toString('hex'));

export function tokenHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Finds the logged-in user from the Cookie header. Returns null when not logged in. */
export async function findSession(cookieHeader) {
  const match = (cookieHeader || '').match(/(?:^|;\s*)clinic_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const [rows] = await pool.execute(
    `SELECT sessions.token_hash, sessions.csrf_token,
            users.id AS user_id, users.username, users.name, users.role, users.patient_id
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1`,
    [tokenHash(match[1]), Date.now()]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user: { id: row.user_id, username: row.username, name: row.name, role: row.role, patientId: row.patient_id || null },
    csrfToken: row.csrf_token,
    tokenHash: row.token_hash
  };
}

/** Checks the password, starts a new session, and ends the caller's previous one. */
export async function login(body, previousSession) {
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
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  await withTransaction(async connection => {
    await connection.execute('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    if (previousSession) {
      await connection.execute('DELETE FROM sessions WHERE token_hash = ?', [previousSession.tokenHash]);
    }
    await connection.execute(
      'INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES(?,?,?,?)',
      [tokenHash(token), user.id, csrfToken, Date.now() + SESSION_AGE]
    );
  });
  return {
    token,
    csrfToken,
    user: { id: user.id, username: user.username, name: user.name, role: user.role }
  };
}

export async function logout(sessionTokenHash) {
  await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [sessionTokenHash]);
}
