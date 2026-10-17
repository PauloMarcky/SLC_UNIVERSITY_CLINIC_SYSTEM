import { readJson } from '../utils/http.js';
import { routeId } from '../utils/validators.js';
import {
  listVisits, createVisit, triageVisit, queueVisits, screenedVisits, completeVisit, screenVisit
} from '../services/visits.service.js';

// Only the filter and paging options the services know about are passed on.
const LOG_OPTIONS = ['search', 'from', 'bmi', 'sentToHospital', 'excludeScreenedCopies', 'page', 'pageSize'];
const optionsOf = query => Object.fromEntries(LOG_OPTIONS.filter(key => query[key] !== undefined).map(key => [key, query[key]]));

export async function list(req, res) {
  const result = await listVisits({
    ...optionsOf(req.query),
    search: req.query.search || '',
    type: req.query.type || '',
    college: req.query.college || ''
  }, req.session.user);
  res.status(200).json(result);
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
  res.status(200).json(await screenedVisits(req.session.user, optionsOf(req.query)));
}

export async function complete(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await completeVisit(id, await readJson(req), req.session.user) });
}

export async function screen(req, res) {
  const id = routeId(req.params.id);
  res.status(200).json({ visit: await screenVisit(id, await readJson(req), req.session.user) });
}
