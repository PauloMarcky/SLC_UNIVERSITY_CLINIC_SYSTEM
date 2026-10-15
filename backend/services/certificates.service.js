import { pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/http-error.js';
import { text } from '../utils/validators.js';
import { checkRole } from '../utils/authz.js';
import { patient } from './patients.service.js';
import { notify } from './notifications.service.js';

export const STATUSES = Object.freeze({
  DRAFT: 'Draft',
  PENDING: 'Pending Approval',
  RETURNED: 'Returned for Revision',
  APPROVED: 'Approved'
});
export const TYPES = ['Medical Certificate', 'Fitness to Return', 'Medical Clearance', 'Consultation Certificate'];

function checkVersion(current, version) {
  if (!Number.isInteger(version) || version !== current.version) {
    throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
  }
}

export function rowToCertificate(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    patient: JSON.parse(row.patient_json),
    patientName: row.patient_name,
    type: row.type,
    certificateDate: row.certificate_date,
    purpose: row.purpose,
    findings: row.findings,
    recommendations: row.recommendations,
    otherDetails: row.other_details,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name,
    remarks: row.remarks,
    revisedFromId: row.revised_from_id
  };
}

export async function getCertificate(id, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM certificates WHERE id=?', [id]);
  const result = rowToCertificate(rows[0]);
  if (!result) throw new HttpError(404, 'Certificate not found.');
  return result;
}

async function fields(body, connection) {
  const patientId = text(body.patientId, 'Patient', 100, true);
  const record = await patient(patientId, connection);
  if (!record) throw new HttpError(400, 'Select an existing patient record.');
  const type = text(body.type, 'Certificate type', 100, true);
  if (!TYPES.includes(type)) throw new HttpError(400, 'Select a valid certificate type.');
  const date = text(body.certificateDate, 'Certificate date', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, 'Enter a valid certificate date.');
  }
  return {
    patientId,
    patient: record,
    patientName: text(body.patientName ?? record.name, 'Patient name', 200, true),
    type,
    certificateDate: date,
    purpose: text(body.purpose, 'Purpose', 1000),
    findings: text(body.findings, 'Medical findings', 10000),
    recommendations: text(body.recommendations, 'Recommendations', 10000),
    otherDetails: text(body.otherDetails, 'Other details', 10000)
  };
}

async function history(current, action, actor, remarks, connection) {
  await connection.execute(
    `INSERT INTO certificate_history(certificate_id,action,actor_id,actor_name,created_at,remarks,certificate_version,snapshot_json)
     VALUES(?,?,?,?,?,?,?,?)`,
    [current.id, action, actor.id, actor.name, new Date().toISOString(), remarks || '', current.version, JSON.stringify(current)]
  );
}

async function insertCertificate(data, actor, revisedFromId, connection) {
  const now = new Date().toISOString();
  const [result] = await connection.execute(
    `INSERT INTO certificates(
      patient_id,patient_json,patient_name,type,certificate_date,purpose,findings,recommendations,other_details,
      status,created_at,updated_at,created_by,created_by_name,updated_by,updated_by_name,revised_from_id,remarks
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.patientId, JSON.stringify(data.patient), data.patientName, data.type, data.certificateDate,
      data.purpose, data.findings, data.recommendations, data.otherDetails, STATUSES.DRAFT,
      now, now, actor.id, actor.name, actor.id, actor.name, revisedFromId, ''
    ]
  );
  const current = await getCertificate(result.insertId, connection);
  await history(
    current,
    revisedFromId ? 'Revision created' : 'Created',
    actor,
    revisedFromId ? `Revision of approved certificate #${revisedFromId}.` : '',
    connection
  );
  return current;
}

export async function createCertificate(body, actor) {
  checkRole(actor, 'nurse');
  return withTransaction(async connection => {
    const data = await fields(body, connection);
    return insertCertificate(data, actor, null, connection);
  });
}

export async function updateCertificate(id, body, actor) {
  checkRole(actor, 'nurse');
  return withTransaction(async connection => {
    const current = await getCertificate(id, connection);
    checkVersion(current, body.version);
    if (![STATUSES.DRAFT, STATUSES.RETURNED].includes(current.status)) {
      throw new HttpError(409, 'Only Draft or Returned for Revision certificates can be edited.');
    }
    const data = await fields(body, connection);
    const [result] = await connection.execute(
      `UPDATE certificates SET patient_id=?,patient_json=?,patient_name=?,type=?,certificate_date=?,purpose=?,findings=?,recommendations=?,other_details=?,
       updated_at=?,updated_by=?,updated_by_name=?,version=version+1
       WHERE id=? AND version=?`,
      [
        data.patientId, JSON.stringify(data.patient), data.patientName, data.type, data.certificateDate,
        data.purpose, data.findings, data.recommendations, data.otherDetails,
        new Date().toISOString(), actor.id, actor.name, id, current.version
      ]
    );
    if (!result.affectedRows) throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
    const updated = await getCertificate(id, connection);
    await history(updated, 'Edited', actor, '', connection);
    return updated;
  });
}

export async function transition(id, action, body, actor) {
  checkRole(actor, action === 'submit' || action === 'revise' ? 'nurse' : 'doctor');
  return withTransaction(async connection => {
    const current = await getCertificate(id, connection);
    checkVersion(current, body.version);
    const now = new Date().toISOString();

    if (action === 'revise') {
      if (current.status !== STATUSES.APPROVED) {
        throw new HttpError(409, 'Only approved certificates can start a new revision.');
      }
      return insertCertificate(current, actor, current.id, connection);
    }

    if (action === 'submit') {
      if (![STATUSES.DRAFT, STATUSES.RETURNED].includes(current.status)) {
        throw new HttpError(409, 'Only Draft or Returned for Revision certificates can be submitted.');
      }
      if (!current.purpose || !current.findings) {
        throw new HttpError(400, 'Purpose and medical findings are required before submission.');
      }
      const [result] = await connection.execute(
        `UPDATE certificates SET status=?,submitted_at=?,submitted_by=?,submitted_by_name=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
         WHERE id=? AND version=?`,
        [STATUSES.PENDING, now, actor.id, actor.name, now, actor.id, actor.name, id, current.version]
      );
      if (!result.affectedRows) throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
      const updated = await getCertificate(id, connection);
      await history(updated, 'Submitted for approval', actor, '', connection);
      const [doctorRows] = await connection.execute("SELECT id FROM users WHERE role='doctor' AND active=1");
      await notify(
        doctorRows.map(user => user.id),
        updated,
        `${actor.name} submitted certificate #${id} for ${current.patientName} for approval.`,
        connection
      );
      return updated;
    }

    if (current.status !== STATUSES.PENDING) {
      throw new HttpError(409, 'Only Pending Approval certificates can be reviewed.');
    }
    const remarks = text(body.remarks, 'Remarks', 2000, action === 'return');

    if (action === 'approve') {
      const [result] = await connection.execute(
        `UPDATE certificates SET status=?,approved_at=?,approved_by=?,approved_by_name=?,remarks=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
         WHERE id=? AND version=?`,
        [STATUSES.APPROVED, now, actor.id, actor.name, remarks, now, actor.id, actor.name, id, current.version]
      );
      if (!result.affectedRows) throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
    } else if (action === 'return') {
      const [result] = await connection.execute(
        `UPDATE certificates SET status=?,remarks=?,updated_at=?,updated_by=?,updated_by_name=?,version=version+1
         WHERE id=? AND version=?`,
        [STATUSES.RETURNED, remarks, now, actor.id, actor.name, id, current.version]
      );
      if (!result.affectedRows) throw new HttpError(409, 'This certificate changed. Reload it before continuing.');
    } else {
      throw new HttpError(404, 'Unknown certificate action.');
    }

    const updated = await getCertificate(id, connection);
    await history(updated, action === 'approve' ? 'Approved' : 'Returned for revision', actor, remarks, connection);
    await notify(
      [current.createdBy, current.submittedBy].filter(Boolean),
      updated,
      `${actor.name} ${action === 'approve' ? 'approved' : 'returned'} certificate #${id} for ${current.patientName}${action === 'return' ? ': ' + remarks : '.'}`,
      connection
    );
    return updated;
  });
}

export async function listCertificates(status) {
  if (status && !Object.values(STATUSES).includes(status)) {
    throw new HttpError(400, 'Invalid certificate status.');
  }
  const [rows] = status
    ? await pool.execute(
        'SELECT * FROM certificates WHERE status = ? ORDER BY updated_at DESC, id DESC',
        [status]
      )
    : await pool.execute('SELECT * FROM certificates ORDER BY updated_at DESC, id DESC');
  return rows.map(rowToCertificate);
}

export async function getCertificateWithHistory(id) {
  const certificate = await getCertificate(id);
  const [history] = await pool.execute(
    `SELECT id, action, actor_id AS actorId, actor_name AS actorName,
            created_at AS createdAt, remarks, certificate_version AS version
     FROM certificate_history WHERE certificate_id = ? ORDER BY id`,
    [id]
  );
  return { certificate, history };
}
