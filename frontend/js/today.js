/* Fills in today's date from the device clock (local time, not UTC).
   <p data-today="long">  ->  "October 10, 2026"
   <input data-today="iso"> -> "2026-10-10" */
(function () {
    'use strict';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const iso = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const long = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    document.querySelectorAll('[data-today]').forEach(function (el) {
        const text = el.dataset.today === 'iso' ? iso : long;
        if ('value' in el) el.value = text; else el.textContent = text;
    });
})();
