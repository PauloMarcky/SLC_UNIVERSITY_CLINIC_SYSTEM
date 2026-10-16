import { readJson } from '../utils/http.js';
import { idFrom, routeId } from '../utils/validators.js';
import {
  listMedicines, listBatches, receiveStock, adjustStock, listMovements, reorderList
} from '../services/inventory.service.js';

export async function medicines(req, res) {
  res.status(200).json({
    medicines: await listMedicines({
      search: req.query.search || '',
      category: req.query.category || '',
      status: req.query.status || ''
    })
  });
}

export async function batches(req, res) {
  res.status(200).json({ batches: await listBatches(routeId(req.params.id)) });
}

export async function receive(req, res) {
  res.status(201).json(await receiveStock(await readJson(req), req.session.user));
}

export async function adjust(req, res) {
  res.status(200).json(await adjustStock(await readJson(req), req.session.user));
}

export async function movements(req, res) {
  const medicineId = req.query.medicineId;
  res.status(200).json({ movements: await listMovements({ medicineId: medicineId ? idFrom(medicineId) : null }) });
}

export async function reorder(req, res) {
  res.status(200).json({ items: await reorderList() });
}
