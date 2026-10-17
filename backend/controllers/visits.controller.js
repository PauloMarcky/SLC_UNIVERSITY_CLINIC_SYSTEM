import { readJson } from '../utils/http.js';
import { routeId } from '../utils/validators.js';
import {
  listVisits, createVisit, triageVisit, updateTriage, cancelVisit, queueVisits, screenedVisits, completeVisit, screenVisit
} from '../services/visits.service.js';

export async function list(req, res) {
  const visits = await listVisits({
    search: req.query.search || '',
    type: req.query.type || '',
    college: req.query.college || '',
    copies: req.query.copies || ''
  }, req.session.user);
  res.status(200).json({ visits });
}

export async function create(req, res) {
  res.status(201).json({ visit: await createVisit(await readJson(req), req.session.user) });
}

export async function triage(req, res) {
  res.status(201).json({ visit: await triageVisit(await readJson(req), req.session.user) });
}

export async function queue(req, res) {
  res.status(200).json({ visits: await queueVisits(req.session.user) });
}

export async function screened(req, res) {
  res.status(200).json({ visits: await screenedVisits(req.session.user) });
}

export async function complete(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await completeVisit(id, await readJson(req), req.session.user) });
}

export async function update(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await updateTriage(id, await readJson(req), req.session.user) });
}

export async function cancel(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await cancelVisit(id, req.session.user) });
}

export async function screen(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await screenVisit(id, await readJson(req), req.session.user) });
}
