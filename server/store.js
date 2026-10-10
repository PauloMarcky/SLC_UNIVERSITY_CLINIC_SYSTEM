import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const STATUSES = Object.freeze({ DRAFT: 'Draft', PENDING: 'Pending Approval', RETURNED: 'Returned for Revision', APPROVED: 'Approved' });
const TYPES = ['Medical Certificate', 'Fitness to Return', 'Medical Clearance', 'Consultation Certificate'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, hash) {
  const [salt, encoded] = hash.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

function openStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('nurse','doctor')),
      password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, college TEXT NOT NULL DEFAULT '',
      course TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'student'
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
      patient_json TEXT NOT NULL, patient_name TEXT NOT NULL, type TEXT NOT NULL,
      certificate_date TEXT NOT NULL, purpose TEXT NOT NULL, findings TEXT NOT NULL,
      recommendations TEXT NOT NULL, other_details TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Draft','Pending Approval','Returned for Revision','Approved')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id), created_by_name TEXT NOT NULL,
      updated_by INTEGER NOT NULL REFERENCES users(id), updated_by_name TEXT NOT NULL,
      submitted_at TEXT, submitted_by INTEGER REFERENCES users(id), submitted_by_name TEXT,
      approved_at TEXT, approved_by INTEGER REFERENCES users(id), approved_by_name TEXT,
      remarks TEXT NOT NULL DEFAULT '', revised_from_id INTEGER REFERENCES certificates(id)
    );
    CREATE TABLE IF NOT EXISTS certificate_history (
      id INTEGER PRIMARY KEY, certificate_id INTEGER NOT NULL REFERENCES certificates(id),
      action TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id), actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL, remarks TEXT NOT NULL DEFAULT '',
      certificate_version INTEGER NOT NULL, snapshot_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY, recipient_id INTEGER NOT NULL REFERENCES users(id),
      certificate_id INTEGER NOT NULL REFERENCES certificates(id), message TEXT NOT NULL,
      created_at TEXT NOT NULL, read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS certificates_status ON certificates(status, updated_at);
    CREATE INDEX IF NOT EXISTS history_certificate ON certificate_history(certificate_id, id);
    CREATE INDEX IF NOT EXISTS notification_recipient ON notifications(recipient_id, id);
    CREATE TRIGGER IF NOT EXISTS protect_approved_certificate_update
      BEFORE UPDATE ON certificates WHEN OLD.status = 'Approved'
      BEGIN SELECT RAISE(ABORT, 'Approved certificates are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS protect_approved_certificate_delete
      BEFORE DELETE ON certificates WHEN OLD.status = 'Approved'
      BEGIN SELECT RAISE(ABORT, 'Approved certificates are immutable'); END;
  `);
  const seed = db.prepare('INSERT OR IGNORE INTO patients(id,name,college,course,year,category) VALUES(?,?,?,?,?,?)');
  seed.run('2026-00123', 'Maria Dizon', 'IT', 'BSIT', '3', 'student');
  seed.run('2025-00456', 'Paolo Reyes', 'Engineering', 'BSCE', '4', 'student');
  seed.run('2024-00789', 'Angela Cruz', 'Nursing', 'BSN', '2', 'student');
  seed.run('E-0098', 'Jose Ramos', 'Maintenance', '', '', 'employee');

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function createUser({ username, password, name, role }) {
    if (!['nurse', 'doctor'].includes(role)) throw new Error('Role must be nurse or doctor.');
    if (typeof username !== 'string' || !/^[a-zA-Z0-9._@-]{3,100}$/.test(username)) throw new Error('Username must be 3–100 letters, numbers, or . _ @ - characters.');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) throw new Error('A name of at most 200 characters is required.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('Password must be 12–200 characters.');
    const result = db.prepare('INSERT INTO users(username,name,role,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(username, name.trim(), role, passwordHash(password), new Date().toISOString());
    return { id: Number(result.lastInsertRowid), username, name: name.trim(), role };
  }

  function userById(id) {
    return db.prepare('SELECT id,username,name,role FROM users WHERE id=? AND active=1').get(id);
  }

  function patient(id) {
    return db.prepare('SELECT id,name,college,course,year,category FROM patients WHERE id=?').get(id);
  }

  function certificate(row) {
    if (!row) return null;
    return {
      id: row.id, patientId: row.patient_id, patient: JSON.parse(row.patient_json),
      patientName: row.patient_name, type: row.type, certificateDate: row.certificate_date,
      purpose: row.purpose, findings: row.findings, recommendations: row.recommendations,
      otherDetails: row.other_details, status: row.status, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at,
      createdBy: row.created_by, createdByName: row.created_by_name,
      updatedBy: row.updated_by, updatedByName: row.updated_by_name,
      submittedAt: row.submitted_at, submittedBy: row.submitted_by, submittedByName: row.submitted_by_name,
      approvedAt: row.approved_at, approvedBy: row.approved_by, approvedByName: row.approved_by_name,
      remarks: row.remarks, revisedFromId: row.revised_from_id
    };
  }

  function getCertificate(id) {
    const result = certificate(db.prepare('SELECT * FROM certificates WHERE id=?').get(id));
    if (!result) throw new HttpError(404, 'Certificate not found.');
    return result;
  }

  function checkRole(actor, role) {
    if (actor.role !== role) throw new HttpError(403, `Only a ${role} can perform this action.`);
  }

  function checkVersion(current, version) {
    if (!Number.isInteger(version) || version !== current.version) throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
  }

  function cleanText(value, field, max, required = false) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
    const result = value.trim();
    if (result.length > max || (required && !result)) throw new HttpError(400, `${field} ${required && !result ? 'is required' : `must be at most ${max} characters`}.`);
    return result;
  }

  function fields(body) {
    const patientId = cleanText(body.patientId, 'Patient', 100, true);
    const record = patient(patientId);
    if (!record) throw new HttpError(400, 'Select an existing patient record.');
    const type = cleanText(body.type, 'Certificate type', 100, true);
    if (!TYPES.includes(type)) throw new HttpError(400, 'Select a valid certificate type.');
    const date = cleanText(body.certificateDate, 'Certificate date', 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
      throw new HttpError(400, 'Enter a valid certificate date.');
    }
    return {
      patientId, patient: record, patientName: cleanText(body.patientName ?? record.name, 'Patient name', 200, true), type,
      certificateDate: date, purpose: cleanText(body.purpose, 'Purpose', 1000),
      findings: cleanText(body.findings, 'Medical findings', 10000),
      recommendations: cleanText(body.recommendations, 'Recommendations', 10000),
      otherDetails: cleanText(body.otherDetails, 'Other details', 10000)
    };
  }

  function history(current, action, actor, remarks = '') {
    db.prepare('INSERT INTO certificate_history(certificate_id,action,actor_id,actor_name,created_at,remarks,certificate_version,snapshot_json) VALUES(?,?,?,?,?,?,?,?)')
      .run(current.id, action, actor.id, actor.name, new Date().toISOString(), remarks, current.version, JSON.stringify(current));
  }

  function notify(recipients, current, message) {
    const statement = db.prepare('INSERT INTO notifications(recipient_id,certificate_id,message,created_at) VALUES(?,?,?,?)');
    for (const recipient of new Set(recipients)) statement.run(recipient, current.id, message, new Date().toISOString());
  }

  function insertCertificate(data, actor, revisedFromId = null) {
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO certificates(
      patient_id,patient_json,patient_name,type,certificate_date,purpose,findings,recommendations,other_details,
      status,created_at,updated_at,created_by,created_by_name,updated_by,updated_by_name,revised_from_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      data.patientId, JSON.stringify(data.patient), data.patientName, data.type, data.certificateDate,
      data.purpose, data.findings, data.recommendations, data.otherDetails, STATUSES.DRAFT,
      now, now, actor.id, actor.name, actor.id, actor.name, revisedFromId
    );
    const current = getCertificate(Number(result.lastInsertRowid));
    history(current, revisedFromId ? 'Revision created' : 'Created', actor, revisedFromId ? `Revision of approved certificate #${revisedFromId}.` : '');
    return current;
  }

  function createCertificate(body, actor) {
    checkRole(actor, 'nurse');
    return transaction(() => insertCertificate(fields(body), actor));
  }

  function updateCertificate(id, body, actor) {
    checkRole(actor, 'nurse');
    return transaction(() => {
      const current = getCertificate(id);
      checkVersion(current, body.version);
      if (![STATUSES.DRAFT, STATUSES.RETURNED].includes(current.status)) throw new HttpError(409, 'Only Draft or Returned for Revision certificates can be edited.');
      const data = fields(body);
      db.prepare(`UPDATE certificates SET patient_id=?,patient_json=?,patient_name=?,type=?,certificate_date=?,purpose=?,findings=?,recommendations=?,other_details=?,
        updated_at=?,updated_by=?,updated_by_name=?,version=version+1 WHERE id=? AND version=?`).run(
        data.patientId, JSON.stringify(data.patient), data.patientName, data.type, data.certificateDate,
        data.purpose, data.findings, data.recommendations, data.otherDetails, new Date().toISOString(), actor.id, actor.name, id, current.version
      );
      const updated = getCertificate(id);
      history(updated, 'Edited', actor);
      return updated;
    });
  }

  function transition(id, action, body, actor) {
    checkRole(actor, action === 'submit' || action === 'revise' ? 'nurse' : 'doctor');
    return transaction(() => {
      const current = getCertificate(id);
      checkVersion(current, body.version);
      const now = new Date().toISOString();
      if (action === 'revise') {
        if (current.status !== STATUSES.APPROVED) throw new HttpError(409, 'Only approved certificates can start a new revision.');
        return insertCertificate(current, actor, current.id);
      }
      if (action === 'submit') {
        if (![STATUSES.DRAFT, STATUSES.RETURNED].includes(current.status)) throw new HttpError(409, 'Only Draft or Returned for Revision certificates can be submitted.');
        if (!current.purpose || !current.findings) throw new HttpError(400, 'Purpose and medical findings are required before submission.');
        db.prepare(`UPDATE certificates SET status=?,submitted_at=?,submitted_by=?,submitted_by_name=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
          WHERE id=? AND version=?`).run(STATUSES.PENDING, now, actor.id, actor.name, now, actor.id, actor.name, id, current.version);
        const updated = getCertificate(id);
        history(updated, 'Submitted for approval', actor);
        notify(db.prepare("SELECT id FROM users WHERE role='doctor' AND active=1").all().map(user => user.id), updated, `${actor.name} submitted certificate #${id} for ${current.patientName} for approval.`);
        return updated;
      }
      if (current.status !== STATUSES.PENDING) throw new HttpError(409, 'Only Pending Approval certificates can be reviewed.');
      const remarks = cleanText(body.remarks, 'Remarks', 2000, action === 'return');
      if (action === 'approve') {
        db.prepare(`UPDATE certificates SET status=?,approved_at=?,approved_by=?,approved_by_name=?,remarks=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
          WHERE id=? AND version=?`).run(STATUSES.APPROVED, now, actor.id, actor.name, remarks, now, actor.id, actor.name, id, current.version);
      } else if (action === 'return') {
        db.prepare(`UPDATE certificates SET status=?,remarks=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
          WHERE id=? AND version=?`).run(STATUSES.RETURNED, remarks, now, actor.id, actor.name, id, current.version);
      } else throw new HttpError(404, 'Unknown certificate action.');
      const updated = getCertificate(id);
      history(updated, action === 'approve' ? 'Approved' : 'Returned for revision', actor, remarks);
      notify([current.createdBy, current.submittedBy].filter(Boolean), updated, `${actor.name} ${action === 'approve' ? 'approved' : 'returned'} certificate #${id} for ${current.patientName}${action === 'return' ? ': ' + remarks : '.'}`);
      return updated;
    });
  }

  return { db, transaction, createUser, userById, patient, certificate, getCertificate, createCertificate, updateCertificate, transition };
}

export { openStore, HttpError, STATUSES, TYPES, verifyPassword, passwordHash };
