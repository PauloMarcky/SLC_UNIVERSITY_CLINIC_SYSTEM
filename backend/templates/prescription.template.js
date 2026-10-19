const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Printable prescription slip (open /prescriptions/:id/print, then Ctrl+P). */
export function renderPrescription(rx, config) {
  const rows = rx.items.map((i, n) => `
    <tr>
      <td>${n + 1}</td>
      <td><b>${esc(i.medicine)}</b><br><small>${esc(i.instructions)}</small></td>
      <td>${esc(i.dose)}<br>${esc(i.frequency)}<br>for ${i.durationDays} day${i.durationDays === 1 ? '' : 's'}</td>
      <td>${i.quantity}</td>
    </tr>`).join('');
  const state = rx.status === 'dispensed' ? `Dispensed ${esc(rx.dispensedAt?.slice(0, 10))} by ${esc(rx.dispensedBy)}`
    : rx.status === 'cancelled' ? 'CANCELLED' : 'NOT YET DISPENSED';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Prescription RX-${rx.id}</title>
<style>
 body{font:14px/1.4 Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}
 h1{font-size:18px;margin:0}h2{font-size:14px;margin:2px 0 14px;font-weight:normal}
 header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
 table{width:100%;border-collapse:collapse;margin:12px 0}
 th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
 .meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
 .sign{margin-top:48px;width:260px;border-top:1px solid #111;padding-top:4px}
 .state{margin-top:16px;font-weight:bold}
 @media print{.noprint{display:none}}
</style></head><body>
<header><h1>${esc(config.universityName)}</h1><h2>${esc(config.clinicName)} &mdash; Prescription</h2></header>
<div class="meta">
  <div><b>Patient:</b> ${esc(rx.patientName)} (${esc(rx.patientId)})<br><b>College:</b> ${esc(rx.college) || '&mdash;'}</div>
  <div><b>Rx no.:</b> RX-${rx.id}<br><b>Date:</b> ${esc(String(rx.visitDate).slice(0, 10))}</div>
</div>
<table><thead><tr><th>#</th><th>Medicine</th><th>Dose / frequency</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign">${esc(rx.prescribedBy)}<br><small>Prescribing doctor</small></div>
<p class="state">${state}</p>
<p class="noprint"><button onclick="window.print()">Print</button></p>
</body></html>`;
}
