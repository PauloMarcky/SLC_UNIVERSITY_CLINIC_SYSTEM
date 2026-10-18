/* Nurse assessment: find a patient, record history, review past visits, record vitals and send the patient to the doctor's queue.
   Students are registered in Student Records, so this page only looks them up.
   The patient search is a custom dropdown: GET /api/patients?search=...&limit=8, with keyboard support. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const PAGE = 8;                 // matches shown in the dropdown
    const input = $('psearch');
    const list = $('patient-results');
    let selected = null, timer, ticket = 0;
    let results = [], total = 0, active = -1;

    const num = n => Number(n).toLocaleString('en-US');
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }
    function say(text, bad) {
        const box = $('flow-message');
        box.textContent = text || '';
        box.hidden = !text;
        box.classList.toggle('user-message-error', Boolean(text && bad));
        if (text) box.focus();
    }
    function fail(error) {
        if (error.status === 401) window.location.assign('/index.html');
        else say(error.message, true);
    }

    // ---------- small formatters ----------
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
    function courseYear(p) { return [p.course, p.year ? 'Year ' + p.year : ''].filter(Boolean).join(' '); }
    function highlight(text, q) {
        const t = String(text == null ? '' : text);
        const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
        if (i < 0) return escapeHtml(t);
        return escapeHtml(t.slice(0, i)) + '<mark>' + escapeHtml(t.slice(i, i + q.length)) + '</mark>' + escapeHtml(t.slice(i + q.length));
    }

    // ---------- the dropdown ----------
    function openList() { list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function closeList() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-activedescendant', ''); }
    function showState(text) {
        list.innerHTML = '<li class="pt-state" role="presentation">' + text + '</li>';
        openList();
    }
    function setActive(index) {
        active = index;
        list.querySelectorAll('[role="option"]').forEach(function (li, i) {
            li.classList.toggle('is-active', i === index);
            li.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
        input.setAttribute('aria-activedescendant', index >= 0 ? 'pt-opt-' + index : '');
        const el = $('pt-opt-' + index);
        if (el) el.scrollIntoView({ block: 'nearest' });
    }
    function render(q) {
        if (!results.length) {
            showState('No student found for \u201C' + escapeHtml(q) + '\u201D. Check the spelling, or add the student in <a href="../nurse/medical-records.html">Student Records</a>.');
            return;
        }
        list.innerHTML = results.map(function (p, i) {
            const meta = [p.id, window.SLCDepartments ? window.SLCDepartments.short(p.college) : p.college, courseYear(p)].filter(Boolean).map(function (part) { return highlight(part, q); }).join(' &middot; ');
            return '<li role="option" id="pt-opt-' + i + '" data-index="' + i + '" aria-selected="' + (i === active ? 'true' : 'false') + '"' +
                (i === active ? ' class="is-active"' : '') + '>' +
                '<span class="pt-main"><strong>' + highlight(p.name, q) + '</strong><small>' + meta + '</small></span>' +
                '<span class="pt-last">' + (p.lastVisit ? 'Last visit ' + escapeHtml(formatDate(p.lastVisit)) : 'No visits yet') + '</span></li>';
        }).join('') + (total > results.length
            ? '<li class="pt-foot" role="presentation">Showing ' + num(results.length) + ' of ' + num(total) + ' matches. Keep typing to narrow the list.</li>'
            : '');
        openList();
        setActive(active);
    }
    async function runSearch() {
        const q = input.value.trim();
        if (!q) { closeList(); return; }
        const mine = ++ticket;
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(q) + '&limit=' + PAGE + '&schoolYear=current');
            if (mine !== ticket || selected) return;      // a newer search, or a patient was already chosen
            results = result.patients;
            total = result.total;
            active = results.length ? 0 : -1;
            render(q);
        } catch (error) {
            if (mine === ticket) { closeList(); fail(error); }
        }
    }

    input.addEventListener('input', function () {
        if (selected) clearSelection();
        $('psearch-clear').hidden = !input.value;
        clearTimeout(timer);
        if (!input.value.trim()) { ticket++; closeList(); return; }
        showState('Searching\u2026');
        timer = setTimeout(runSearch, 200);
    });
    input.addEventListener('focus', function () {
        if (!selected && results.length && input.value.trim()) { openList(); }
    });
    input.addEventListener('keydown', function (event) {
        const open = !list.hidden && results.length > 0;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open && results.length) { openList(); setActive(Math.max(active, 0)); }
            else if (open) setActive((active + 1) % results.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (open) setActive((active - 1 + results.length) % results.length);
        } else if (event.key === 'Home' && open) {
            event.preventDefault(); setActive(0);
        } else if (event.key === 'End' && open) {
            event.preventDefault(); setActive(results.length - 1);
        } else if (event.key === 'Enter') {
            if (open && active >= 0) { event.preventDefault(); choose(results[active]); }
            else { event.preventDefault(); clearTimeout(timer); runSearch(); }
        } else if (event.key === 'Escape') {
            if (!list.hidden) { event.preventDefault(); closeList(); }
        } else if (event.key === 'Tab') {
            closeList();
        }
    });
    list.addEventListener('mousedown', function (event) { event.preventDefault(); });   // keep the focus in the search box
    list.addEventListener('mousemove', function (event) {
        const li = event.target.closest('[role="option"]');
        if (li && Number(li.dataset.index) !== active) setActive(Number(li.dataset.index));
    });
    list.addEventListener('click', function (event) {
        const li = event.target.closest('[role="option"]');
        if (li) choose(results[Number(li.dataset.index)]);
    });
    document.addEventListener('mousedown', function (event) {
        if (!$('pt-search').contains(event.target)) closeList();
    });
    $('psearch-clear').addEventListener('click', function () { resetSearch(); input.focus(); });
    $('pc-change').addEventListener('click', function () { resetSearch(); input.focus(); });

    // ---------- choosing and clearing a patient ----------
    function showPanels(visible) {
        $('triage-form').hidden = !visible;
        $('history-box').hidden = !visible;
        $('past-box').hidden = !visible;
        $('patient-card').hidden = !visible;
    }
    function clearSelection() {
        selected = null;
        showPanels(false);
        $('patient-hint').textContent = '';
    }
    function resetSearch() {
        clearTimeout(timer);
        ticket++;
        clearSelection();
        input.value = '';
        results = [];
        total = 0;
        active = -1;
        $('psearch-clear').hidden = true;
        closeList();
    }
    async function choose(patient) {
        if (!patient) return;
        selected = patient;
        ticket++;
        clearTimeout(timer);
        input.value = patient.name;
        $('psearch-clear').hidden = false;
        closeList();
        $('pc-name').textContent = patient.name;
        const age = ageFrom(patient.dateOfBirth);
        $('pc-meta').textContent = [patient.id, window.SLCDepartments ? window.SLCDepartments.short(patient.college) : patient.college, courseYear(patient), age !== '' ? age + ' yrs' : '',
            patient.lastVisit ? 'Last visit ' + formatDate(patient.lastVisit) : 'No visits yet'].filter(Boolean).join(' \u00B7 ');
        $('open-record').setAttribute('href', '../nurse/record-detail.html?id=' + encodeURIComponent(patient.id));
        showPanels(true);
        try {
            const result = await api.request('/api/patients/' + encodeURIComponent(patient.id) + '/history');
            if (!selected || selected.id !== patient.id) return;
            fillHistory(result.history);
            loadPastVisits(patient);
        } catch (error) { fail(error); }
    }

    // ---------- past visits (completed visits only; the server hides confidential ones from the nurse) ----------
    function pastCell(text) {
        const td = document.createElement('td');
        td.textContent = text == null || text === '' ? '\u2014' : String(text);
        return td;
    }
    async function loadPastVisits(patient) {
        const rows = $('past-rows');
        const empty = text => {
            const tr = document.createElement('tr'), td = pastCell(text);
            td.colSpan = 5;
            tr.append(td);
            rows.replaceChildren(tr);
        };
        empty('Loading\u2026');
        try {
            const result = await api.request('/api/visits?search=' + encodeURIComponent(patient.id));
            if (!selected || selected.id !== patient.id) return; // another patient was picked meanwhile
            const own = result.visits.filter(v => v.patientId === patient.id);
            if (!own.length) return empty('No past visits.');
            rows.replaceChildren(...own.map(v => {
                const tr = document.createElement('tr');
                tr.append(pastCell(v.visitDate), pastCell(v.visitType), pastCell(v.complaint),
                    pastCell(v.diagnosis), pastCell(v.actionsTaken));
                return tr;
            }));
        } catch (error) { fail(error); }
    }

    // ---------- medical history ----------
    function fillHistory(h) {
        $('h-asthma').checked = h.asthma;
        $('h-allergy').checked = h.allergy;
        $('h-febrile').checked = h.febrileConvulsion;
        $('h-fainting').checked = h.faintingSpell;
        $('h-epilepsy').checked = h.epilepsy;
        $('h-allergy-details').value = h.allergyDetails;
        $('h-vaccines').value = h.vaccines;
        $('h-other').value = h.otherCondition;
    }
    $('history-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected) return;
        try {
            await api.request('/api/patients/' + encodeURIComponent(selected.id) + '/history', {
                method: 'PUT',
                body: {
                    asthma: $('h-asthma').checked, allergy: $('h-allergy').checked,
                    febrileConvulsion: $('h-febrile').checked, faintingSpell: $('h-fainting').checked,
                    epilepsy: $('h-epilepsy').checked, allergyDetails: $('h-allergy-details').value,
                    vaccines: $('h-vaccines').value, otherCondition: $('h-other').value
                }
            });
            say('Medical history saved.');
        } catch (error) { fail(error); }
    });

    // ---------- assessment ----------
    function updateBmi() {
        const kg = parseFloat($('w').value), cm = parseFloat($('h').value);
        $('b').value = kg > 0 && cm > 0 ? (kg / Math.pow(cm / 100, 2)).toFixed(1) : 'Enter weight and height';
    }
    $('w').addEventListener('input', updateBmi);
    $('h').addEventListener('input', updateBmi);

    // The outside lab fields only appear while "External lab results" is ticked.
    // Unticking hides and clears them, so nothing is saved or shown to the doctor.
    function syncLabFields() {
        const on = $('labs').checked;
        document.querySelectorAll('.lab-field').forEach(field => { field.hidden = !on; });
        if (!on) ['lab-name', 'lab-location', 'lab-date'].forEach(id => { $(id).value = ''; });
        else {
            // Scroll the nearest scrolling box (the page or a popup) all the way down.
            let box = $('lab-date').parentElement;
            while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
            const scroller = box || document.scrollingElement;
            scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
        }
    }
    $('labs').addEventListener('change', syncLabFields);

    function todayIso() {
        const n = new Date(), pad = v => String(v).padStart(2, '0');
        return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
    }
    $('triage-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected) return say('Select a patient first.', true);
        const button = $('save-triage');
        const name = selected.name;
        button.disabled = true;
        try {
            await api.getSession();
            const result = await api.request('/api/visits/triage', {
                method: 'POST',
                body: {
                    patientId: selected.id, visitType: $('t').value, visitDate: $('d').value || todayIso(),
                    complaint: $('c').value, bp: $('bp').value, weight: $('w').value, height: $('h').value,
                    pulseRate: $('pulse').value, temperature: $('temp').value, initialDiagnosis: $('idx').value,
                    externalLabsAttached: $('labs').checked,
                    labSourceName: $('lab-name').value, labSourceLocation: $('lab-location').value,
                    labReceivedAt: $('lab-date').value
                }
            });
            ['c', 'bp', 'pulse', 'temp', 'w', 'h', 'idx', 'lab-name', 'lab-location', 'lab-date'].forEach(id => { $(id).value = ''; });
            $('labs').checked = false;
            syncLabFields();
            updateBmi();
            resetSearch();                                   // ready for the next patient
            say('Assessment saved. Visit #' + result.visit.id + ' for ' + name + ' is in the doctor\u2019s queue.');
            input.focus();
        } catch (error) { fail(error); }
        finally { button.disabled = false; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'nurse') say('Only a nurse can record an assessment.', true);
    }).catch(fail);
})();