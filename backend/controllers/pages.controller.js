// Printable HTML pages (not JSON). The routes check the login before these run.
import { HttpError } from '../utils/http-error.js';
import { routeId } from '../utils/validators.js';
import { STATUSES, getCertificate } from '../services/certificates.service.js';
import { getPrescription } from '../services/prescriptions.service.js';
import { renderCertificate } from '../templates/certificate.template.js';
import { renderPrescription } from '../templates/prescription.template.js';

const html = (res, body) => res.status(200).set('Content-Type', 'text/html; charset=utf-8').end(body);

/** official = true for /print (approved certificates only), false for /preview. */
export const certificatePage = official => async (req, res) => {
  const certificate = await getCertificate(routeId(req.params.id));
  if (official && certificate.status !== STATUSES.APPROVED) {
    throw new HttpError(409, 'Only doctor-approved certificates can be printed.');
  }
  html(res, renderCertificate(certificate, req.app.locals.clinicConfig, { official }));
};

export async function prescriptionPage(req, res) {
  const rx = await getPrescription(routeId(req.params.id), req.session.user);
  if (rx.patientId === null) throw new HttpError(403, 'This prescription belongs to a confidential visit.');
  html(res, renderPrescription(rx, req.app.locals.clinicConfig));
}
