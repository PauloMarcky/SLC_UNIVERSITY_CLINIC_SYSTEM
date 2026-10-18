import { readJson } from '../utils/http.js';
import {
  searchPatients, searchPatientsPage, getPatient, updatePatient, getPatientRecord, registerPatient, getHistory, saveHistory, getRequirements, saveRequirements
} from '../services/patients.service.js';

export async function search(req, res) {
  // With ?limit= the Student Records page gets one page plus the real totals; without it, the plain list.
  if (req.query.limit !== undefined) {
    return res.status(200).json(await searchPatientsPage(req.query, req.session.user));
  }
  res.status(200).json({ patients: await searchPatients(req.query.search, req.session.user, req.query.schoolYear || '') });
}

export async function record(req, res) {
  res.status(200).json({ record: await getPatientRecord(req.params.id, req.session.user, { schoolYear: req.query.schoolYear || '' }) });
}

export async function register(req, res) {
  res.status(201).json({ patient: await registerPatient(await readJson(req), req.session.user) });
}

export async function history(req, res) {
  res.status(200).json({ history: await getHistory(req.params.id) });
}

export async function updateHistory(req, res) {
  const saved = await saveHistory(req.params.id, await readJson(req), req.session.user);
  res.status(200).json({ history: saved });
}

export async function read(req, res) {
  res.status(200).json({ patient: await getPatient(req.params.id) });
}

export async function update(req, res) {
  res.status(200).json({ patient: await updatePatient(req.params.id, await readJson(req), req.session.user) });
}

export async function requirements(req, res) {
  res.status(200).json({ requirements: await getRequirements(req.params.id) });
}

export async function updateRequirements(req, res) {
  res.status(200).json({ requirements: await saveRequirements(req.params.id, await readJson(req), req.session.user) });
}
