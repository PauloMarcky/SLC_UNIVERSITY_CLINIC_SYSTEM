import { readJson } from '../utils/http.js';
import { routeId } from '../utils/validators.js';
import { listUsers, createManagedUser, updateManagedUser, deactivateUser } from '../services/users.service.js';

export async function list(req, res) {
  res.status(200).json({ users: await listUsers(req.session.user) });
}

export async function create(req, res) {
  res.status(201).json({ user: await createManagedUser(await readJson(req), req.session.user) });
}

export async function update(req, res) {
  const user = await updateManagedUser(routeId(req.params.id), await readJson(req), req.session.user);
  res.status(200).json({ user });
}

export async function deactivate(req, res) {
  res.status(200).json({ user: await deactivateUser(routeId(req.params.id), req.session.user) });
}
