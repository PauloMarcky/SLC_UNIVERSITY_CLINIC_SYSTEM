import { readJson } from '../utils/http.js';
import { routeId } from '../utils/validators.js';
import {
  listPrescriptions, listForPatient, dispensePrescription, cancelPrescription
} from '../services/prescriptions.service.js';

export async function list(req, res) {
  const prescriptions = await listPrescriptions({ status: req.query.status || 'pending' }, req.session.user);
  res.status(200).json({ prescriptions });
}

export async function dispense(req, res) {
  res.status(200).json({ prescription: await dispensePrescription(routeId(req.params.id), req.session.user) });
}

export async function cancel(req, res) {
  const prescription = await cancelPrescription(routeId(req.params.id), await readJson(req), req.session.user);
  res.status(200).json({ prescription });
}

export async function forPatient(req, res) {
  res.status(200).json({ prescriptions: await listForPatient(req.params.id, req.session.user) });
}
