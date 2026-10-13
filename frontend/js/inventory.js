// Nurse inventory page: live stock, stock in, adjustments, reorder list, and the dispensing queue.
(function () {
  const h = window.rxEl, api = window.rxApi;
  const $ = id => document.getElementById(id);
  const PILL = { OK: 'green', LOW: 'yellow', EXPIRING: 'yellow', OUT: 'red', EXPIRED: 'red' };
  const LABEL = { OK: 'OK', LOW: 'LOW', EXPIRING: 'EXPIRING', OUT: 'OUT', EXPIRED: 'EXPIRED' };
  const REASON = { received: 'Received', dispensed: 'Dispensed', damaged: 'Damaged', lost: 'Lost',
    expired_disposal: 'Expired disposal', correction: 'Correction' };
  let medicines = [];
  let batchMedicine = null;
  let reorderRows = [];

  function say(text, bad = false) {
    const el = $('inv-message');
    el.textContent = text; el.hidden = !text;
    el.style.borderColor = bad ? '#c0392b' : '';
    if (text) el.focus();
  }
  function err(id, text) { const el = $(id); el.textContent = text || ''; el.hidden = !text; }

  // ---------- medicine table ----------
  function stockClass(m) { return m.status === 'OUT' || m.status === 'EXPIRED' ? 'c-crit' : m.status === 'LOW' ? 'c-warn' : 'c-good'; }
  function expiryClass(m) { return m.status === 'EXPIRING' ? 'c-warn' : ''; }

  async function loadMedicines() {
    medicines = (await api('/api/medicines')).medicines;
    const cats = [...new Set(medicines.map(m => m.category).filter(Boolean))].sort();
    const keep = $('f-category').value;
    $('f-category').replaceChildren(h('option', { value: '' }, 'All categories'),
      ...cats.map(c => h('option', { value: c }, c)));
    $('f-category').value = cats.includes(keep) ? keep : '';
    renderTable();
  }

  function renderTable() {
    const q = $('f-search').value.trim().toLowerCase();
    const cat = $('f-category').value, st = $('f-status').value;
    const rows = medicines.filter(m =>
      (!q || m.name.toLowerCase().includes(q)) && (!cat || m.category === cat) && (!st || m.status === st));
    $('med-body').replaceChildren(...(rows.length ? rows.map(m => h('tr', {},
      h('td', {}, m.name),
      h('td', {}, m.category || '—'),
      h('td', { class: stockClass(m) }, m.stock, m.expiredQty ? h('div', { class: 'inv-sub' }, `+${m.expiredQty} expired`) : null),
      h('td', {}, m.unit),
      h('td', {}, m.reorderLevel),
      h('td', { class: expiryClass(m) }, m.nextExpiry || '—'),
      h('td', {}, h('span', { class: `pill ${PILL[m.status]}` }, LABEL[m.status])),
      h('td', {}, h('button', { type: 'button', class: 'btn sec', onclick: () => openBatches(m) }, 'Batches'))))
      : [h('tr', {}, h('td', { colspan: '8' }, 'No medicines match.'))]));
  }

  ['f-search', 'f-category', 'f-status'].forEach(id => $(id).addEventListener('input', renderTable));

  // ---------- dispensing queue ----------
  async function loadQueue() {
    const { prescriptions } = await api('/api/prescriptions?status=pending');
    $('queue-count').textContent = prescriptions.length;
    $('queue').replaceChildren(...(prescriptions.length ? prescriptions.map(rxCard)
      : [h('p', { class: 'rx-empty' }, 'No prescriptions waiting.')]));
  }

  function rxCard(rx) {
    const who = rx.patientId ? `${rx.patientName} (${rx.patientId})` : rx.patientName;
    const btn = h('button', { type: 'button', class: 'btn', onclick: () => dispense(rx, btn) }, 'Dispense');
    return h('article', { class: 'rx-card' },
      h('header', {}, h('b', {}, `RX-${rx.id} · ${who}`),
        h('span', { class: 'inv-sub' }, `Dr. ${rx.prescribedBy} · ${String(rx.visitDate).slice(0, 10)}`)),
      h('ul', {}, ...rx.items.map(i => h('li', {},
        h('b', {}, i.medicine), ` — ${i.dose}, ${i.frequency}, ${i.durationDays} day${i.durationDays === 1 ? '' : 's'}; give `,
        h('b', {}, `${i.quantity} ${i.unit}`), i.instructions ? ` (${i.instructions})` : ''))),
      h('div', { class: 'rx-actions' }, btn,
        rx.patientId ? h('a', { class: 'btn sec', href: `/prescriptions/${rx.id}/print`, target: '_blank', rel: 'noopener' }, 'Print slip') : null));
  }

  async function dispense(rx, btn) {
    if (!confirm(`Dispense RX-${rx.id}? This deducts stock and cannot be undone.`)) return;
    btn.disabled = true;
    try {
      await api(`/api/prescriptions/${rx.id}/dispense`, { method: 'POST', body: {} });
      say(`RX-${rx.id} dispensed. Stock updated.`);
    } catch (e) { say(e.message, true); }
    btn.disabled = false;
    await Promise.all([loadQueue(), loadMedicines()]);
  }

  // ---------- stock in ----------
  function openStockIn() {
    err('stockin-error', '');
    $('form-stockin').reset();
    $('si-med').replaceChildren(h('option', { value: '' }, 'Select medicine'),
      ...medicines.map(m => h('option', { value: m.id }, `${m.name} (${m.unit})`)),
      h('option', { value: 'new' }, '+ New medicine…'));
    toggleNew();
    $('dlg-stockin').showModal();
  }
  function toggleNew() {
    const isNew = $('si-med').value === 'new';
    document.querySelectorAll('#dlg-stockin [data-new]').forEach(el => { el.hidden = !isNew; });
  }
  $('si-med').addEventListener('change', toggleNew);

  $('form-stockin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = id => $(id).value.trim();
    if (!$('si-med').value) return err('stockin-error', 'Select a medicine.');
    const body = { lotNo: v('si-lot'), quantity: v('si-qty'), expiryDate: v('si-expiry'), supplier: v('si-supplier') };
    if ($('si-med').value === 'new') {
      body.newMedicine = { name: v('si-name'), category: v('si-category'), unit: v('si-unit'), reorderLevel: v('si-reorder') };
    } else body.medicineId = $('si-med').value;
    try {
      await api('/api/inventory/receive', { method: 'POST', body });
      $('dlg-stockin').close();
      say('Stock received.');
      await loadMedicines();
    } catch (e) { err('stockin-error', e.message); }
  });

  // ---------- batches, adjustments, history ----------
  async function openBatches(m) {
    batchMedicine = m;
    err('batch-error', '');
    $('form-adjust').hidden = true;
    $('dlg-batches-title').textContent = `${m.name} — batches`;
    $('dlg-batches').showModal();
    await refreshBatches();
  }

  async function refreshBatches() {
    const m = batchMedicine;
    const [{ batches }, { movements }] = await Promise.all([
      api(`/api/medicines/${m.id}/batches`), api(`/api/inventory/movements?medicineId=${m.id}`)]);
    $('batch-body').replaceChildren(...(batches.length ? batches.map(b => h('tr', {},
      h('td', {}, b.lotNo),
      h('td', {}, b.quantity),
      h('td', { class: b.expired ? 'c-bad' : b.daysToExpiry <= 60 ? 'c-warn' : '' }, b.expiryDate, b.expired ? ' (expired)' : ''),
      h('td', {}, b.supplier || '—'),
      h('td', {}, b.dateReceived),
      h('td', {}, h('button', { type: 'button', class: 'btn sec', onclick: () => openAdjust(b) }, 'Adjust'))))
      : [h('tr', {}, h('td', { colspan: '6' }, 'No batches yet. Use Stock In.'))]));
    $('move-body').replaceChildren(...(movements.length ? movements.slice(0, 50).map(x => h('tr', {},
      h('td', {}, x.createdAt.slice(0, 16).replace('T', ' ')),
      h('td', {}, x.lotNo),
      h('td', { class: x.change < 0 ? 'c-bad' : 'c-good' }, x.change > 0 ? `+${x.change}` : x.change),
      h('td', {}, REASON[x.reason] || x.reason),
      h('td', {}, x.ref || '—'),
      h('td', {}, x.userName)))
      : [h('tr', {}, h('td', { colspan: '6' }, 'No movements yet.'))]));
  }

  let adjustBatch = null;
  function openAdjust(b) {
    adjustBatch = b;
    $('adjust-title').textContent = `Adjust lot ${b.lotNo} (currently ${b.quantity})`;
    $('form-adjust').reset();
    $('form-adjust').hidden = false;
    $('ad-qty').focus();
  }
  $('ad-cancel').addEventListener('click', () => { $('form-adjust').hidden = true; });
  $('form-adjust').addEventListener('submit', async ev => {
    ev.preventDefault();
    err('batch-error', '');
    try {
      await api('/api/inventory/adjust', { method: 'POST', body: {
        batchId: adjustBatch.id, reason: $('ad-reason').value, change: $('ad-qty').value, remark: $('ad-remark').value.trim() } });
      $('form-adjust').hidden = true;
      await Promise.all([refreshBatches(), loadMedicines()]);
    } catch (e) { err('batch-error', e.message); }
  });

  // ---------- reorder report ----------
  $('btn-reorder').addEventListener('click', async () => {
    try {
      reorderRows = (await api('/api/inventory/reorder')).items;
      $('reorder-body').replaceChildren(...(reorderRows.length ? reorderRows.map(m => h('tr', {},
        h('td', {}, m.name), h('td', {}, m.category || '—'), h('td', {}, `${m.stock} ${m.unit}`),
        h('td', {}, m.reorderLevel), h('td', {}, `${m.suggestedOrder} ${m.unit}`),
        h('td', {}, h('span', { class: `pill ${PILL[m.status]}` }, LABEL[m.status]))))
        : [h('tr', {}, h('td', { colspan: '6' }, 'Nothing needs reordering.'))]));
      $('dlg-reorder').showModal();
    } catch (e) { say(e.message, true); }
  });
  $('reorder-csv').addEventListener('click', () => {
    const cell = v => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Medicine', 'Category', 'Unit', 'Stock', 'Reorder level', 'Suggested order', 'Status'],
      ...reorderRows.map(m => [m.name, m.category, m.unit, m.stock, m.reorderLevel, m.suggestedOrder, m.status])];
    const blob = new Blob(['﻿' + lines.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `reorder-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  });

  // ---------- shared ----------
  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('btn-stockin').addEventListener('click', openStockIn);

  Promise.all([loadMedicines(), loadQueue()]).catch(e => say(e.message, true));
})();
