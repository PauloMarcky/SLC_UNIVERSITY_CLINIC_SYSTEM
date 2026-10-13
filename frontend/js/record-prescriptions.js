// Adds a "Prescriptions" box to record-detail.html. It reads the patient id from the page URL.
// ASSUMPTION: the id is in the query string as ?id=, ?patientId= or ?patient= (I have not seen record-detail.js).
(function () {
  const h = window.rxEl;
  const params = new URLSearchParams(location.search);
  const patientId = params.get('id') || params.get('patientId') || params.get('patient');
  const host = document.getElementById('rx-history');
  if (!host || !patientId) return;

  const STATUS = { pending: ['yellow', 'Waiting'], dispensed: ['green', 'Dispensed'], cancelled: ['red', 'Cancelled'] };

  window.rxApi(`/api/patients/${encodeURIComponent(patientId)}/prescriptions`).then(({ prescriptions }) => {
    host.replaceChildren(h('h3', {}, 'Prescriptions'), ...(prescriptions.length ? prescriptions.map(rx => {
      const [colour, label] = STATUS[rx.status] || ['', rx.status];
      return h('article', { class: 'rx-card' },
        h('header', {}, h('b', {}, `RX-${rx.id} · ${String(rx.visitDate).slice(0, 10)}`),
          h('span', { class: `pill ${colour}` }, label)),
        h('ul', {}, ...rx.items.map(i => h('li', {},
          `${i.medicine} — ${i.dose}, ${i.frequency}, ${i.durationDays}d (qty ${i.quantity} ${i.unit})`))),
        h('span', { class: 'inv-sub' }, `Dr. ${rx.prescribedBy}${rx.dispensedBy ? ` · dispensed by ${rx.dispensedBy}` : ''}`),
        rx.status !== 'cancelled' ? h('div', {}, h('a', { href: `/prescriptions/${rx.id}/print`, target: '_blank', rel: 'noopener' }, 'Print slip')) : null);
    }) : [h('p', { class: 'rx-empty' }, 'No prescriptions on record.')]));
  }).catch(e => host.replaceChildren(h('p', { class: 'field-error' }, e.message)));
})();
