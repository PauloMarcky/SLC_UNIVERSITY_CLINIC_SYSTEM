// Prescription section of the doctor's visit form.
// Public API for queue.js:
//   PrescriptionBuilder.validate()    -> error text, or '' when OK
//   PrescriptionBuilder.getPayload()  -> { items: [...] } or null when nothing is prescribed
//   PrescriptionBuilder.reset()       -> clear after a successful save
(function () {
  const root = document.getElementById('rx-builder');
  if (!root) return;
  const h = window.rxEl;

  const items = [];

  const med = h('input', { id: 'rx-med', type: 'text', maxlength: '150', autocomplete: 'off', placeholder: 'Type medicine name', 'aria-label': 'Medicine' });
  const dose = h('input', { id: 'rx-dose', type: 'text', maxlength: '100', placeholder: 'e.g. 500 mg', 'aria-label': 'Dose per intake' });
  const freq = h('select', { id: 'rx-freq', 'aria-label': 'Frequency' },
    h('option', { value: '' }, 'Frequency'),
    window.RX_FREQUENCIES.map(f => h('option', { value: f.label }, f.label)));
  const days = h('input', { id: 'rx-days', type: 'number', min: '1', max: '365', step: '1', placeholder: 'Days', 'aria-label': 'Duration in days' });
  const qty = h('input', { id: 'rx-qty', type: 'number', min: '1', max: '1000', step: '1', placeholder: 'Qty', 'aria-label': 'Quantity to dispense' });
  const instr = h('input', { id: 'rx-instr', maxlength: '300', placeholder: 'e.g. after meals', 'aria-label': 'Instructions' });
  const addBtn = h('button', { type: 'button', class: 'btn sec', onclick: addItem }, 'Add medicine');
  const errorEl = h('p', { class: 'field-error', id: 'rx-error', role: 'alert', hidden: true }, '');
  const list = h('tbody', {});
  const table = h('table', { class: 'rx-table', hidden: true },
    h('thead', {}, h('tr', {}, ['Medicine', 'Dose', 'Frequency', 'Days', 'Qty', 'Instructions', ''].map(t => h('th', {}, t)))),
    list);

  root.append(
    h('div', { class: 'rx-row' },
      h('div', { class: 'f rx-med' }, h('label', { for: 'rx-med' }, 'Medicine'), med),
      h('div', { class: 'f' }, h('label', { for: 'rx-dose' }, 'Dose per intake'), dose),
      h('div', { class: 'f' }, h('label', { for: 'rx-freq' }, 'Frequency'), freq),
      h('div', { class: 'f' }, h('label', { for: 'rx-days' }, 'Days'), days),
      h('div', { class: 'f' }, h('label', { for: 'rx-qty' }, 'Qty to dispense'), qty),
      h('div', { class: 'f rx-instr' }, h('label', { for: 'rx-instr' }, 'Instructions'), instr),
      h('div', { class: 'f rx-add' }, addBtn)),
    errorEl, table);

  function showError(message) { errorEl.textContent = message; errorEl.hidden = !message; }

  function draftIsEmpty() { return !med.value.trim() && !dose.value.trim() && !freq.value && !days.value && !qty.value && !instr.value.trim(); }

  function clearDraft() {
    med.value = ''; dose.value = ''; freq.value = ''; days.value = ''; qty.value = ''; instr.value = '';
  }

  function addItem() {
    showError('');
    const name = med.value.trim();
    const doseText = dose.value.trim();
    const n = Number(days.value), q = Number(qty.value);
    if (!name) return showError('Type the medicine name.');
    if (items.some(i => i.medicine.toLowerCase() === name.toLowerCase())) return showError(`${name} is already on this prescription.`);
    if (!doseText) return showError('Enter the dose per intake.');
    if (!freq.value) return showError('Select how often the medicine is taken.');
    if (!Number.isInteger(n) || n < 1 || n > 365) return showError('Days must be a whole number from 1 to 365.');
    if (!Number.isInteger(q) || q < 1 || q > 1000) return showError('Quantity must be a whole number from 1 to 1000.');
    items.push({
      medicine: name, dose: doseText, frequency: freq.value, durationDays: n, quantity: q,
      instructions: instr.value.trim()
    });
    clearDraft();
    render();
  }

  function render() {
    table.hidden = items.length === 0;
    list.replaceChildren(...items.map((i, idx) => h('tr', {},
      h('td', {}, i.medicine), h('td', {}, i.dose), h('td', {}, i.frequency),
      h('td', {}, i.durationDays), h('td', {}, i.quantity), h('td', {}, i.instructions || '—'),
      h('td', {}, h('button', {
        type: 'button', class: 'btn sec rx-remove', 'aria-label': `Remove ${i.medicine}`,
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
        items: items.map(({ medicine, dose, frequency, durationDays, quantity, instructions }) =>
          ({ medicine, dose, frequency, durationDays, quantity, instructions }))
      };
    },
    reset() { items.length = 0; clearDraft(); render(); showError(''); }
  };
})();