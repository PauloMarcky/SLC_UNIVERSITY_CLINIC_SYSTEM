import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text } from '../utils/validators.js';
import { checkRole } from '../utils/authz.js';
import { passwordHash } from '../utils/password.js';
import { patient } from './patients.service.js';

export async function createUser({ username, password, name, role, patientId = null }, connection = pool) {
  if (!['nurse', 'doctor'].includes(role)) {
    throw new Error('Role must be nurse or doctor.');
  }
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._@-]{3,100}$/.test(username)) {
    throw new Error('Username must be 3–100 letters, numbers, or . _ @ - characters.');
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    throw new Error('A name of at most 200 characters is required.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Password must be 12–200 characters.');
  }
  const [result] = await connection.execute(
    'INSERT INTO users(username,name,role,patient_id,password_hash,created_at) VALUES(?,?,?,?,?,?)',
    [username, name.trim(), role, patientId || null, passwordHash(password), new Date().toISOString()]
  );
  return { id: result.insertId, username, name: name.trim(), role, patientId: patientId || null };
}

const USER_ROLES = ['nurse', 'doctor'];

function managedUserRole(value) {
  if (typeof value !== 'string' || !USER_ROLES.includes(value)) {
    throw new HttpError(400, 'Select a valid user role.');
  }
  return value;
}

async function managedPatientId(role, value, connection) {
  if (!['student', 'employee'].includes(role)) return null;
  const patientId = text(value, 'Patient ID', 50, true);
  const record = await patient(patientId, connection);
  if (!record) throw new HttpError(400, 'Select an existing patient record for this role.');
  return patientId;
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: Number(row.active) === 1,
    patientId: row.patient_id || null
  };
}

export async function listUsers(actor) {
  checkRole(actor, 'doctor');
  const [rows] = await pool.execute(
    'SELECT id, username, name, role, active, patient_id FROM users ORDER BY name, username'
  );
  return rows.map(publicUser);
}

export async function createManagedUser(body, actor) {
  checkRole(actor, 'doctor');
  const name = text(body.name, 'Name', 200, true);
  const username = text(body.username, 'Username', 100, true);
  if (!/^[a-zA-Z0-9._@-]{3,100}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3–100 letters, numbers, or . _ @ - characters.');
  }
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) {
    throw new HttpError(400, 'Password must be 12–200 characters.');
  }
  const role = managedUserRole(body.role);
  if (typeof body.active !== 'boolean') throw new HttpError(400, 'Choose whether this account is active.');
  const patientId = await managedPatientId(role, body.patientId, pool);
  try {
    const [result] = await pool.execute(
      `INSERT INTO users(username, name, role, patient_id, password_hash, active, created_at)
       VALUES(?,?,?,?,?,?,?)`,
      [username, name, role, patientId, passwordHash(body.password), body.active ? 1 : 0, new Date().toISOString()]
    );
    return { id: result.insertId, username, name, role, active: body.active, patientId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That username is already in use.');
    throw error;
  }
}

export async function updateManagedUser(id, body, actor) {
  checkRole(actor, 'doctor');
  return withTransaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT id, username, name, role, active, patient_id FROM users WHERE id = ? FOR UPDATE',
      [id]
    );
    const existing = rows[0];
    if (!existing) throw new HttpError(404, 'User not found.');

    const name = text(body.name, 'Name', 200, true);
    const role = managedUserRole(body.role);
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'Choose whether this account is active.');
    if (Number(existing.id) === Number(actor.id) && (role !== existing.role || !body.active)) {
      throw new HttpError(400, 'You cannot change your own role or deactivate your own account.');
    }
    const patientId = await managedPatientId(role, body.patientId, connection);
    await connection.execute(
      'UPDATE users SET name = ?, role = ?, patient_id = ?, active = ? WHERE id = ?',
      [name, role, patientId, body.active ? 1 : 0, id]
    );
    if (role !== existing.role || Boolean(Number(existing.active)) !== body.active) {
      await connection.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    }
    return {
      id: existing.id,
      username: existing.username,
      name,
      role,
      active: body.active,
      patientId
    };
  });
}

export async function deactivateUser(id, actor) {
  checkRole(actor, 'doctor');
  if (Number(id) === Number(actor.id)) {
    throw new HttpError(400, 'You cannot deactivate your own account.');
  }
  return withTransaction(async connection => {
    const [existing] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
    if (!existing.length) throw new HttpError(404, 'User not found.');
    await connection.execute('UPDATE users SET active = 0 WHERE id = ?', [id]);
    await connection.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    const [rows] = await connection.execute(
      'SELECT id, username, name, role, active, patient_id FROM users WHERE id = ?',
      [id]
    );
    return publicUser(rows[0]);
  });
}

export async function userById(id, connection = pool) {
  const [rows] = await connection.execute(
    'SELECT id,username,name,role FROM users WHERE id=? AND active=1',
    [id]
  );
  return rows[0];
}
