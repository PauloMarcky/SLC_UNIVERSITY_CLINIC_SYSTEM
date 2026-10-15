import { readJson } from '../utils/http.js';
import { HttpError } from '../utils/http-error.js';
import { routeId } from '../utils/validators.js';
import {
  listCertificates, createCertificate, getCertificateWithHistory, updateCertificate, transition
} from '../services/certificates.service.js';
import { listNotifications, markNotificationRead } from '../services/notifications.service.js';

const ACTIONS = ['submit', 'approve', 'return', 'revise'];

export async function list(req, res) {
  res.status(200).json({ certificates: await listCertificates(req.query.status || null) });
}

export async function create(req, res) {
  res.status(201).json({ certificate: await createCertificate(await readJson(req), req.session.user) });
}

export async function get(req, res) {
  res.status(200).json(await getCertificateWithHistory(routeId(req.params.id)));
}

export async function update(req, res) {
  const certificate = await updateCertificate(routeId(req.params.id), await readJson(req), req.session.user);
  res.status(200).json({ certificate });
}

export async function act(req, res) {
  const id = routeId(req.params.id);
  const action = req.params.action;
  if (!ACTIONS.includes(action)) throw new HttpError(404, 'API endpoint not found.');
  const certificate = await transition(id, action, await readJson(req), req.session.user);
  res.status(action === 'revise' ? 201 : 200).json({ certificate });
}

export async function notifications(req, res) {
  res.status(200).json({ notifications: await listNotifications(req.session.user.id) });
}

export async function readNotification(req, res) {
  await markNotificationRead(routeId(req.params.id), req.session.user.id);
  res.status(200).json({ ok: true });
}
