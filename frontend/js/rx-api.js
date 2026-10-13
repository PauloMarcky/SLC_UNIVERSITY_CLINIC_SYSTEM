// Small helpers shared by the prescription and inventory pages.
(function () {
  let csrf = null;

  async function token() {
    if (csrf) return csrf;
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/index.html'; throw new Error('Signed out.'); }
    csrf = (await res.json()).csrfToken;
    return csrf;
  }

  // rxApi('/api/medicines')  or  rxApi('/api/inventory/receive', { method: 'POST', body: {...} })
  window.rxApi = async function rxApi(path, opts = {}) {
    const method = opts.method || 'GET';
    const headers = {};
    let body;
    if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    if (method !== 'GET') headers['X-CSRF-Token'] = await token();
    const res = await fetch(path, { method, headers, body, credentials: 'same-origin' });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401) location.href = '/index.html';
      const err = new Error(data.error || 'The request could not be completed.');
      err.status = res.status;
      throw err;
    }
    return data;
  };

  // Keep in sync with FREQUENCIES in backend/prescriptions-store.js. perDay is used to suggest a quantity.
  window.RX_FREQUENCIES = [
    { label: 'Once daily', perDay: 1 },
    { label: 'Twice daily (BID)', perDay: 2 },
    { label: 'Three times daily (TID)', perDay: 3 },
    { label: 'Four times daily (QID)', perDay: 4 },
    { label: 'Every 4 hours', perDay: 6 },
    { label: 'Every 6 hours', perDay: 4 },
    { label: 'Every 8 hours', perDay: 3 },
    { label: 'At bedtime', perDay: 1 },
    { label: 'As needed (PRN)', perDay: null },
    { label: 'Single dose', perDay: null }
  ];

  // Tiny DOM builder: h('td', {class:'x'}, 'text', childNode). Text is never parsed as HTML.
  window.rxEl = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
})();
