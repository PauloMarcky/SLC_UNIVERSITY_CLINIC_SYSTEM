/** Render a printable certificate without trusting any stored text as HTML. */
const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const formatDate = value => {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }).format(date);
};

/**
 * The caller must authenticate and authorize access to the record before rendering.
 * Official output additionally requires an approved record and recorded approval.
 */
export function renderCertificate(certificate, config = {}, { official = false } = {}) {
  if (!certificate || typeof certificate !== 'object') throw new TypeError('A certificate record is required.');
  if (official && (certificate.status !== 'Approved' || !certificate.approvedAt || !certificate.approvedByName)) {
    const error = new Error('Only doctor-approved certificates can be printed as official certificates.');
    error.status = 403;
    error.statusCode = 403;
    throw error;
  }

  const c = certificate;
  const patient = c.patient || c.patientSnapshot || {};
  const universityName = config.universityName || 'ULS';
  const clinicName = config.clinicName || 'University Health Services';
  const text = escapeHtml;
  const detail = (label, value) => value ? `<div class="detail"><dt>${text(label)}</dt><dd>${text(value)}</dd></div>` : '';
  const section = (label, value) => value ? `<section class="content-section"><h2>${text(label)}</h2><p>${text(value)}</p></section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${text(c.type || 'Medical Certificate')} — ${text(c.patientName || 'Patient')}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm 18mm; }
    * { box-sizing: border-box; }
    html { background: #e8edf2; color: #172b3c; font: 11pt/1.65 Georgia, 'Times New Roman', serif; }
    body { margin: 0; padding: 24px 12px 40px; }
    .toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font: 14px/1.5 Arial, sans-serif; }
    .toolbar p { margin: 0; }
    .toolbar button { border: 0; border-radius: 6px; background: #0d4b79; color: white; padding: 12px 20px; font: 600 14px Arial, sans-serif; cursor: pointer; white-space: nowrap; }
    .toolbar button:focus-visible { outline: 3px solid #eba43a; outline-offset: 3px; }
    .certificate { position: relative; max-width: 210mm; min-height: 257mm; margin: auto; padding: 18mm; background: white; box-shadow: 0 3px 24px #1329401a; overflow-wrap: anywhere; }
    .certificate > * { position: relative; z-index: 1; }
    .letterhead { text-align: center; border-bottom: 2px solid #193e5b; padding-bottom: 8mm; margin-bottom: 8mm; break-inside: avoid; }
    .university { margin: 0; font: 700 23pt/1.2 Georgia, 'Times New Roman', serif; letter-spacing: .6px; }
    .clinic { margin: 3mm 0 0; font: 600 12pt/1.4 Arial, sans-serif; }
    .address { margin: 2mm 0 0; font: 9pt/1.5 Arial, sans-serif; white-space: pre-wrap; }
    h1 { margin: 0 0 8mm; font-size: 18pt; letter-spacing: 1.5px; text-align: center; text-transform: uppercase; }
    .reference { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2mm 6mm; margin-bottom: 7mm; font: 9pt/1.5 Arial, sans-serif; }
    .reference p { margin: 0; }
    dl { margin: 0 0 8mm; padding: 5mm; background: #f4f7f9; border: 1px solid #d7e0e7; }
    .detail { display: grid; grid-template-columns: 32mm minmax(0, 1fr); column-gap: 4mm; margin-bottom: 1mm; }
    .detail:last-child { margin-bottom: 0; }
    dt { font-weight: bold; }
    dd { margin: 0; white-space: pre-wrap; }
    .salutation { margin-bottom: 6mm; font-weight: bold; }
    .content-section { margin: 0 0 6mm; }
    h2 { margin: 0 0 2mm; font: 700 10pt/1.4 Arial, sans-serif; color: #193e5b; break-after: avoid; }
    .content-section p { margin: 0; white-space: pre-wrap; orphans: 3; widows: 3; }
    .signature { width: min(100%, 85mm); margin: 12mm 0 0 auto; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .signature-space { height: 22mm; }
    .doctor-name { border-top: 1px solid #263c4d; margin: 0; padding-top: 2mm; font-weight: bold; }
    .signature-label { margin: 1mm 0; font: 9pt/1.5 Arial, sans-serif; }
    .approval { margin: 3mm 0 0; font-size: 10pt; }
    .certificate-footer { margin-top: 12mm; padding-top: 3mm; border-top: 1px solid #d7e0e7; font: 8pt/1.5 Arial, sans-serif; color: #526575; text-align: center; break-inside: avoid; }
    .preview-warning { padding: 4mm; margin: 0 0 7mm; border: 1px solid #bb7220; background: #fff7e8; color: #794809; text-align: center; font: 700 10pt/1.5 Arial, sans-serif; }
    .watermark { position: absolute; inset: 40% 5% auto; z-index: 0; color: #7a879720; text-align: center; font: 700 34pt/1.4 Arial, sans-serif; transform: rotate(-25deg); pointer-events: none; }
    .print-blocked { display: none; }
    @media (max-width: 600px) {
      body { padding: 12px 8px; }
      .certificate { padding: 8mm 6mm; min-height: 0; }
      .toolbar { align-items: flex-start; flex-direction: column; }
      .university { font-size: 20pt; }
      h1 { font-size: 16pt; }
      .detail { grid-template-columns: 27mm minmax(0, 1fr); }
      .watermark { font-size: 26pt; }
    }
    @media print {
      html, body { padding: 0; margin: 0; background: white; color: black; }
      .toolbar { display: none !important; }
      .certificate { max-width: none; min-height: 0; width: auto; padding: 0; margin: 0; box-shadow: none; }
      dl { background: white; }
      h2 { color: black; }
      body.preview .certificate { display: none !important; }
      body.preview .print-blocked { display: block; font: 14pt/1.6 Arial, sans-serif; }
    }
  </style>
</head>
<body class="${official ? 'official' : 'preview'}">
  <div class="toolbar">
    <p>${official ? 'Approved certificate · A4 print format' : `Certificate preview · ${text(c.status || 'Draft')}`}</p>
    ${official ? '<button id="print-certificate" type="button">Print Certificate</button>' : ''}
  </div>
  <main class="certificate" aria-label="${official ? 'Approved medical certificate' : 'Medical certificate preview'}">
    ${official ? '' : '<div class="watermark" aria-hidden="true">NOT AN OFFICIAL<br>CERTIFICATE</div>'}
    <header class="letterhead">
      <p class="university">${text(universityName)}</p>
      <p class="clinic">${text(clinicName)}</p>
      ${config.clinicAddress ? `<p class="address">${text(config.clinicAddress)}</p>` : ''}
      ${config.clinicContact ? `<p class="address">${text(config.clinicContact)}</p>` : ''}
    </header>
    ${official ? '' : '<p class="preview-warning">PREVIEW — NOT AN OFFICIAL CERTIFICATE<br>Use Print Certificate on an approved record to print an official copy.</p>'}
    <h1>${text(c.type || 'Medical Certificate')}</h1>
    <div class="reference">
      <p><strong>Certificate reference:</strong> ${text(c.id)}</p>
      <p><strong>Certificate date:</strong> ${text(formatDate(c.certificateDate))}</p>
    </div>
    <dl>
      ${detail('Patient name', c.patientName)}
      ${detail('Patient ID', c.patientId)}
      ${detail(patient.category === 'employee' ? 'Department' : 'College', patient.college)}
      ${detail('Course', patient.course)}
      ${detail('Year level', patient.year)}
    </dl>
    <p class="salutation">To Whom It May Concern:</p>
    ${section('Purpose', c.purpose)}
    ${section('Medical findings / Certification', c.findings)}
    ${section('Recommendations', c.recommendations)}
    ${section('Additional details', c.otherDetails)}
    <section class="signature" aria-label="Doctor signature and approval">
      <div class="signature-space" aria-label="Space for doctor to sign"></div>
      <p class="doctor-name">${text(c.approvedByName || 'Approving Doctor')}</p>
      <p class="signature-label">Signature of Approving Doctor</p>
      <p class="approval"><strong>Approval date:</strong> ${text(formatDate(c.approvedAt))}</p>
    </section>
    <footer class="certificate-footer">${text(clinicName)} · ${text(universityName)}<br>${official ? 'Doctor-approved certificate. The signature area above is reserved for the approving doctor.' : 'This preview is for review only and is not valid as an official medical certificate.'}</footer>
  </main>
  <p class="print-blocked">This preview is not an official certificate and cannot be printed as one. Open an approved certificate and select Print Certificate.</p>
  ${official ? `<script>
    document.getElementById('print-certificate').addEventListener('click', function () { window.print(); });
    window.addEventListener('load', function () { window.setTimeout(function () { window.print(); }, 150); }, { once: true });
  </script>` : ''}
</body>
</html>`;
}
