// Prescription section of the doctor's visit form.
// Public API for consultation-form.js:
//   PrescriptionBuilder.validate()    -> error text, or '' when OK
//   PrescriptionBuilder.getPayload()  -> { items: [...] } or null when nothing is prescribed
//   PrescriptionBuilder.reset()       -> clear after a successful save
(function () {
  const root = document.getElementById('rx-builder');
  if (!root) return;
  const h = window.rxEl;

  let medicines = [];
  const items = [];
  let qtyTouched = false;

  const sel = h('select', { id: 'rx-med', 'aria-label': 'Medicine' });
  const dose = h('input', { id: 'rx-dose', type: 'number', min: '0.25', step: '0.25', placeholder: 'Dose', 'aria-label': 'Dose amount' });
  const doseUnit = h('span', { class: 'rx-unit' }, '');
  const freq = h('select', { id: 'rx-freq', 'aria-label': 'Frequency' },
    h('option', { value: '' }, 'Frequency'),
    window.RX_FREQUENCIES.map(f => h('option', { value: f.label }, f.label)));
  const days = h('input', { id: 'rx-days', type: 'number', min: '1', max: '365', step: '1', placeholder: 'Days', 'aria-label': 'Duration in days' });
  const qty = h('input', { id: 'rx-qty', type: 'number', min: '1', max: '1000', step: '1', placeholder: 'Qty', 'aria-label': 'Quantity to dispense' });
  const instr = h('input', { id: 'rx-instr', maxlength: '300', placeholder: 'e.g. after meals', 'aria-label': 'Instructions' });
  const addBtn = h('button', { type: 'button', class: 'btn sec', onclick: addItem }, 'Add medicine');
  const stockNote = h('p', { class: 'field-hint', id: 'rx-stock' }, '');
  const errorEl = h('p', { class: 'field-error', id: 'rx-error', role: 'alert', hidden: true }, '');
  const list = h('tbody', {});
  const table = h('table', { class: 'rx-table', hidden: true },
    h('thead', {}, h('tr', {}, ['Medicine', 'Dose', 'Frequency', 'Days', 'Qty', 'Instructions', ''].map(t => h('th', {}, t)))),
    list);

  root.append(
    h('div', { class: 'rx-row' },
      h('div', { class: 'f rx-med' }, h('label', { for: 'rx-med' }, 'Medicine'), sel),
      h('div', { class: 'f' }, h('label', { for: 'rx-dose' }, 'Dose per intake'), h('div', { class: 'rx-dose' }, dose, doseUnit)),
      h('div', { class: 'f' }, h('label', { for: 'rx-freq' }, 'Frequency'), freq),
      h('div', { class: 'f' }, h('label', { for: 'rx-days' }, 'Days'), days),
      h('div', { class: 'f' }, h('label', { for: 'rx-qty' }, 'Qty to dispense'), qty),
      h('div', { class: 'f rx-instr' }, h('label', { for: 'rx-instr' }, 'Instructions'), instr),
      h('div', { class: 'f rx-add' }, addBtn)),
    stockNote, errorEl, table);

  function showError(message) { errorEl.textContent = message; errorEl.hidden = !message; }
  function medicine() { return medicines.find(m => String(m.id) === sel.value); }

  function statusTag(m) {
    if (m.status === 'OUT') return ' — OUT OF STOCK';
    if (m.status === 'EXPIRED') return ' — EXPIRED';
    if (m.status === 'LOW') return ' — low stock';
    if (m.status === 'EXPIRING') return ' — expiring soon';
    return '';
  }

  async function loadMedicines() {
    try {
      medicines = (await window.rxApi('/api/medicines')).medicines;
    } catch (e) { showError(`Could not load medicines: ${e.message}`); return; }
    sel.replaceChildren(
      h('option', { value: '' }, 'Select medicine'),
      ...medicines.map(m => h('option', { value: m.id, disabled: m.stock === 0 },
        `${m.name} (${m.stock} ${m.unit})${statusTag(m)}`)));
  }

  function suggestQty() {
    if (qtyTouched) return;
    const f = window.RX_FREQUENCIES.find(x => x.label === freq.value);
    const d = Number(dose.value), n = Number(days.value);
    if (f && f.perDay && d > 0 && n > 0) qty.value = Math.ceil(d * f.perDay * n);
    else if (freq.value === 'Single dose' && d > 0) qty.value = Math.ceil(d);
  }

  sel.addEventListener('change', () => {
    const m = medicine();
    doseUnit.textContent = m ? m.unit : '';
    stockNote.textContent = m
      ? `${m.stock} ${m.unit} in stock${m.nextExpiry ? `, earliest expiry ${m.nextExpiry}` : ''}${m.expiredQty ? `. ${m.expiredQty} expired ${m.unit} will not be dispensed.` : ''}`
      : '';
    showError('');
  });
  [dose, freq, days].forEach(el => el.addEventListener('input', suggestQty));
  qty.addEventListener('input', () => { qtyTouched = true; });

  function draftIsEmpty() { return !sel.value && !dose.value && !freq.value && !days.value && !qty.value && !instr.value; }

  function clearDraft() {
    sel.value = ''; dose.value = ''; freq.value = ''; days.value = ''; qty.value = ''; instr.value = '';
    doseUnit.textContent = ''; stockNote.textContent = ''; qtyTouched = false;
  }

  function addItem() {
    showError('');
    const m = medicine();
    if (!m) return showError('Select a medicine.');
    if (m.stock === 0) return showError(`${m.name} is ${m.status === 'EXPIRED' ? 'expired' : 'out of stock'} and cannot be prescribed.`);
    if (items.some(i => i.medicineId === m.id)) return showError(`${m.name} is already on this prescription.`);
    const d = Number(dose.value), n = Number(days.value), q = Number(qty.value);
    if (!(d > 0)) return showError('Enter the dose per intake.');
    if (!freq.value) return showError('Select how often the medicine is taken.');
    if (!Number.isInteger(n) || n < 1 || n > 365) return showError('Days must be a whole number from 1 to 365.');
    if (!Number.isInteger(q) || q < 1 || q > 1000) return showError('Quantity must be a whole number from 1 to 1000.');
    if (q > m.stock) return showError(`Only ${m.stock} ${m.unit} of ${m.name} in stock.`);
    items.push({
      medicineId: m.id, name: m.name, unit: m.unit,
      dose: `${d} ${m.unit}`, frequency: freq.value, durationDays: n, quantity: q,
      instructions: instr.value.trim()
    });
    clearDraft();
    render();
  }

  function render() {
    table.hidden = items.length === 0;
    list.replaceChildren(...items.map((i, idx) => h('tr', {},
      h('td', {}, i.name), h('td', {}, i.dose), h('td', {}, i.frequency),
      h('td', {}, i.durationDays), h('td', {}, `${i.quantity} ${i.unit}`), h('td', {}, i.instructions || '—'),
      h('td', {}, h('button', {
        type: 'button', class: 'btn sec rx-remove', 'aria-label': `Remove ${i.name}`,
        onclick: () => { items.splice(idx, 1); render(); }
      }, 'Remove')))));
  }

  window.PrescriptionBuilder = {
    validate() {
      if (!draftIsEmpty()) {
        const msg = 'Press "Add medicine" to include the medicine you are typing, or clear those fields.';
        showError(msg);
        return msg;
      }
      return '';
    },
    getPayload() {
      if (!items.length) return null;
      return {
        items: items.map(({ medicineId, dose, frequency, durationDays, quantity, instructions }) =>
          ({ medicineId, dose, frequency, durationDays, quantity, instructions }))
      };
    },
    reset() { items.length = 0; clearDraft(); render(); showError(''); loadMedicines(); }
  };

  loadMedicines();
})();
