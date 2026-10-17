/* Student Record page: loads the real record.
   GET /api/patients/:id          identification
   GET /api/patients/:id/history  past medical history
   GET /api/visits?search=<id>    completed visits with their vital signs (the server hides confidential ones from the nurse)
   Editing opens the Add / Edit form (add-student.html?id=...). Vital signs are recorded on the Assess page.
   The prescriptions box is filled by record-prescriptions.js from the same ?id= in the address. */
(function () {
    'use strict';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const $ = function (id) { return document.getElementById(id); };
    const api = window.ClinicAPI;
    const view = $('record-view');
    const message = $('record-message');
    if (!view || !message || !api) return;

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    // "2026-10-12" -> "Oct 12, 2026" (no Date object, so no timezone shift)
    function formatDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1] : '';
    }

    function ageFrom(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return '';
        const now = new Date();
        const age = now.getFullYear() - Number(m[1]);
        const before = now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
        return before ? age - 1 : age;
    }

    function dash(value) {
        const text = String(value == null ? '' : value).trim();
        return text ? escapeHtml(text) : '<span class="empty-dash">&mdash;</span>';
    }

    function showMessage(text) {
        message.textContent = text;
        message.hidden = !text;
    }

    /* ---------- Identification ---------- */
    function field(label, valueHtml, extra) {
        return '<div class="id-item' + (extra ? ' ' + extra : '') + '"><span class="id-label">' + escapeHtml(label) + '</span><span class="id-value">' + valueHtml + '</span></div>';
    }

    // The main facts show at once; "More details" opens the rest (names, contacts, address, guardian).
    function renderIdentification(r) {
        const age = ageFrom(r.dateOfBirth);
        $('r-ident').innerHTML =
            field('Identification no.', dash(r.id)) +
            field('Department', dash(r.college)) +
            field('Course / Year', dash([r.course, r.year].filter(Boolean).join(' - '))) +
            field('Gender', dash(r.gender)) +
            field('Age', age === '' ? dash('') : escapeHtml(age)) +
            field('Date of birth', dash(formatDate(r.dateOfBirth)));
        $('r-ident-more').innerHTML =
            field('Last name', dash(r.lastName)) +
            field('First name', dash(r.firstName)) +
            field('Middle name', dash(r.middleName)) +
            field('Status', dash(r.civilStatus)) +
            field('Nationality', dash(r.nationality)) +
            field('Contact number', dash(r.contactNumber)) +
            field('Address', dash(r.address), 'span-2') +
            field('Name of guardian', dash(r.guardianName)) +
            field('Contact no. in case of emergency', dash(r.guardianContact));
    }

    const toggle = $('ident-toggle');
    const more = $('r-ident-more');
    if (toggle && more) {
        toggle.addEventListener('click', function () {
            const open = more.hidden;          // hidden now means it is about to open
            more.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.textContent = open ? 'Fewer details' : 'More details';
        });
    }

    /* ---------- Past medical history ---------- */
    function yes(kind) { return '<span class="yn yes-' + kind + '">&#10003; Yes</span>'; }
    function no() { return '<span class="yn no">No</span>'; }

    function historyRow(label, note, answerHtml, detail) {
        return '<tr><th scope="row">' + escapeHtml(label) + (note ? ' <small>(' + escapeHtml(note) + ')</small>' : '') + '</th>' +
            '<td class="hx-answer">' + answerHtml + '</td>' +
            '<td class="hx-detail">' + (detail ? escapeHtml(detail) : '<span class="empty-dash">&mdash;</span>') + '</td></tr>';
    }

    // Items answered Yes are listed first, then the No ones (each group keeps the form's order).
    function renderHistory(h) {
        const other = String(h.otherCondition || '').trim();
        const vaccines = String(h.vaccines || '').trim();
        const items = [
            { on: !!h.asthma, html: historyRow('Asthma', '', h.asthma ? yes('warn') : no(), '') },
            { on: !!h.allergy, html: historyRow('Allergy', '', h.allergy ? yes('warn') : no(), h.allergy ? h.allergyDetails : '') },
            { on: !!h.febrileConvulsion, html: historyRow('Febrile convulsion', 'Mataas na lagnat', h.febrileConvulsion ? yes('warn') : no(), '') },
            { on: !!h.faintingSpell, html: historyRow('Fainting spell / Dizzy spell', 'Hinihimatay', h.faintingSpell ? yes('warn') : no(), '') },
            { on: !!h.epilepsy, html: historyRow('Epilepsy', '', h.epilepsy ? yes('warn') : no(), '') },
            { on: !!vaccines, html: historyRow('Vaccines', 'Bakuna', vaccines ? yes('ok') : no(), vaccines) },
            { on: !!other, html: '<tr><th scope="row">Other</th><td class="hx-answer">' + (other ? yes('warn') : '<span class="yn no">None</span>') + '</td>' +
                '<td class="hx-detail">' + (other ? escapeHtml(other) : '<span class="empty-dash">&mdash;</span>') + '</td></tr>' }
        ];
        const ordered = items.filter(function (i) { return i.on; }).concat(items.filter(function (i) { return !i.on; }));
        $('r-history').innerHTML = ordered.map(function (i) { return i.html; }).join('');
    }

    /* ---------- Visits: one table, vital signs beside each visit (already newest first from the server) ---------- */
    function emptyRow(cols, text) {
        return '<tr class="no-match"><td colspan="' + cols + '">' + escapeHtml(text) + '</td></tr>';
    }
    const has = function (n) { return typeof n === 'number' && isFinite(n) && n > 0; };
    const cell = function (n, digits) { return has(n) ? escapeHtml(digits === undefined ? n : Number(n).toFixed(digits)) : dash(''); };

    function renderVisits(visits) {
        $('r-visits').innerHTML = visits.length ? visits.map(function (v) {
            const bp = /^\d+\/\d+$/.test(v.bp || '') ? v.bp.replace('/', ' / ') : '';
            return '<tr><td>' + escapeHtml(formatDate(v.visitDate)) + '</td>' +
                '<td>' + dash(v.visitType) + '</td>' +
                '<td>' + dash(v.complaint) + '</td>' +
                '<td>' + dash(bp) + '</td>' +
                '<td>' + cell(v.bodyTemperature, 1) + '</td>' +
                '<td>' + cell(v.pulseRate) + '</td>' +
                '<td>' + cell(v.weightKg) + '</td>' +
                '<td>' + cell(v.heightCm) + '</td>' +
                '<td>' + cell(v.bmi) + '</td>' +
                '<td>' + dash(v.diagnosis) + '</td>' +
                '<td>' + dash(v.actionsTaken) + '</td>' +
                '<td>' + dash(v.doctorName || v.createdByName) + '</td></tr>';
        }).join('') : emptyRow(12, 'No completed visits yet.');
    }

    /* ---------- page ---------- */
    function fullName(r) {
        const first = [r.firstName, r.middleName].filter(Boolean).join(' ');
        return r.lastName ? r.lastName + (first ? ', ' + first : '') : r.name;
    }

    function render(p, history, visits) {
        const name = fullName(p);
        document.title = name + ' - ULS Clinic System';
        $('r-name').textContent = name;
        const age = ageFrom(p.dateOfBirth);
        $('r-line').textContent = ['ID ' + p.id, p.college, p.gender, age === '' ? '' : age + ' years old'].filter(Boolean).join(' · ');
        $('edit-record').setAttribute('href', '../nurse/add-student.html?id=' + encodeURIComponent(p.id));
        renderIdentification(p);
        renderHistory(history);
        renderVisits(visits);
        view.hidden = false;
    }

    function fail(error) {
        if (error.status === 401) { window.location.assign('/index.html'); return; }
        view.hidden = true;
        showMessage(error.status === 404 ? 'Student record not found.' : error.message);
    }

    const id = new URLSearchParams(location.search).get('id');
    if (!id) { showMessage('No student selected. Go back to Student Records and open one.'); return; }
    const path = '/api/patients/' + encodeURIComponent(id);

    Promise.all([api.getSession(), api.request(path), api.request(path + '/history'), api.request('/api/visits?search=' + encodeURIComponent(id))])
        .then(function (results) {
            const session = results[0], patient = results[1].patient, history = results[2].history;
            const visits = results[3].visits.filter(function (v) { return v.patientId === patient.id; });
            render(patient, history, visits);
            // Doctors see the record read-only: tag shown, Edit hidden.
            if (session.user.role === 'doctor') {
                $('readonly-tag').hidden = false;
                $('r-actions').hidden = true;
            }
        })
        .catch(fail);
})();
