import { readJson } from '../utils/http.js';
import { listSchoolYears, createSchoolYear, updateSchoolYear, deleteSchoolYear } from '../services/school-years.service.js';

export async function list(req, res) {
  res.status(200).json(await listSchoolYears());
}

export async function create(req, res) {
  res.status(201).json({ schoolYear: await createSchoolYear(await readJson(req), req.session.user) });
}

export async function update(req, res) {
  res.status(200).json({ schoolYear: await updateSchoolYear(req.params.id, await readJson(req), req.session.user) });
}

export async function remove(req, res) {
  res.status(200).json(await deleteSchoolYear(req.params.id, req.session.user));
}
