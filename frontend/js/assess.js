/* Nurse assessment. Flow: find or register the patient, glance at history and past visits,
   record vitals, send the patient to the doctor's queue, then start the next patient.
   API calls are unchanged: /api/patients (list, create, history), /api/visits, /api/visits/triage. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const RESULT_LIMIT = 8;
    const known = new Map();       // id -> patient seen in search results
    let selected = null;           // patient being assessed
    let saved = null;              // history as stored on the server
    let timer = 0, searchRun = 0, selectRun = 0;
    let options = [], active = -1; // dropdown state
    let busy = false;

    // ---------- small helpers ----------
    function say(text, bad) {
        const box = $('flow-message');
        box.textContent = text || '';
        box.hidden = !text;
        box.classList.toggle('user-message-error', Boolean(text && bad));
        if (text) { box.focus({ preventScroll: true }); box.scrollIntoView({ block: 'nearest' }); }
    }
    function fail(error) {
        if (error.status === 401) window.location.assign('/index.html');
        else say(error.message, true);
    }
    function show(el, on) { el.hidden = !on; }
    function setText(el, text) { el.textContent = text; show(el, Boolean(text)); }
    function todayIso() {
        const n = new Date(), pad = v => String(v).padStart(2, '0');
        return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
    }
    function ageOf(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return null;
        const now = new Date();
        let age = now.getFullYear() - Number(m[1]);
        if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age -= 1;
        return age >= 0 && age < 130 ? age : null;
    }
    function prettyDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        if (!m) return '';
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ---------- patient search (combobox) ----------
    const input = $('psearch'), list = $('patient-results');
    function metaOf(p) {
        return [p.id, p.college, p.lastVisit ? 'Last visit ' + prettyDate(p.lastVisit) : 'No visits yet'].filter(Boolean).join('  \u00b7  ');
    }
    function closeList() {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        active = -1;
    }
    function setActive(index) {
        const items = list.querySelectorAll('.as-opt[data-id]');
        items.forEach((el, i) => el.setAttribute('aria-selected', i === index ? 'true' : 'false'));
        active = index;
        if (items[index]) {
            input.setAttribute('aria-activedescendant', items[index].id);
            items[index].scrollIntoView({ block: 'nearest' });
        } else input.removeAttribute('aria-activedescendant');
    }
    function infoRow(text, cls) {
        const li = document.createElement('li');
        li.className = cls;
        li.setAttribute('role', 'presentation');
        li.textContent = text;
        return li;
    }
    function renderList(patients, total, term) {
        options = patients.slice(0, RESULT_LIMIT);
        const rows = options.map((p, i) => {
            const li = document.createElement('li');
            li.className = 'as-opt';
            li.id = 'opt-' + i;
            li.dataset.id = p.id;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');
            const name = document.createElement('b'), meta = document.createElement('small');
            name.textContent = p.name || p.id;
            meta.textContent = metaOf(p);
            li.append(name, meta);
            return li;
        });
        if (!rows.length) {
            const li = infoRow('No patient matches \u201c' + term + '\u201d. ', 'as-opt-empty');
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'as-opt-register';
            add.textContent = 'Register a new patient';
            li.append(add);
            rows.push(li);
        }
        else if (total > rows.length) rows.push(infoRow((total - rows.length) + ' more. Keep typing to narrow the list.', 'as-opt-more'));
        list.replaceChildren(...rows);
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        active = -1;
        input.removeAttribute('aria-activedescendant');
    }
    async function searchPatients() {
        const term = input.value.trim();
        const run = ++searchRun;
        if (!term) { closeList(); setText($('patient-hint'), ''); return; }
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(term));
            if (run !== searchRun) return; // an older answer arrived late
            result.patients.forEach(p => known.set(p.id, p));
            renderList(result.patients, result.patients.length, term);
            setText($('patient-hint'), '');
            fillColleges(result.patients);
            // An exact ID match is almost always the one the nurse wants.
            const exact = options.findIndex(p => p.id.toLowerCase() === term.toLowerCase());
            if (exact >= 0) setActive(exact);
            else if (options.length === 1) setActive(0);
        } catch (error) { if (run === searchRun) fail(error); }
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(searchPatients, 200); });
    input.addEventListener('focus', () => { if (input.value.trim() && list.hidden) searchPatients(); });
    input.addEventListener('keydown', event => {
        const count = options.length;
        if (event.key === 'ArrowDown' && !list.hidden && count) { event.preventDefault(); setActive((active + 1) % count); }
        else if (event.key === 'ArrowUp' && !list.hidden && count) { event.preventDefault(); setActive((active - 1 + count) % count); }
        else if (event.key === 'Enter') {
            event.preventDefault();
            if (!list.hidden && options[active]) choose(options[active]);
            else if (!list.hidden && options.length === 1) choose(options[0]);
        } else if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); closeList(); }
    });
    list.addEventListener('mousedown', event => {
        if (event.target.closest('.as-opt-register')) { event.preventDefault(); openRegister(true); return; }
        const row = event.target.closest('.as-opt[data-id]');
        if (!row) return;
        event.preventDefault(); // keep focus out of the way of the blur handler
        choose(known.get(row.dataset.id));
    });
    document.addEventListener('click', event => { if (!event.target.closest('.as-combo')) closeList(); });
    input.addEventListener('blur', () => setTimeout(closeList, 120));

    function fillColleges(patients) {
        const names = [...new Set(patients.map(p => p.college).filter(Boolean))].sort();
        if (!names.length) return;
        const have = new Set([...$('college-list').children].map(o => o.value));
        names.filter(n => !have.has(n)).forEach(n => {
            const option = document.createElement('option');
            option.value = n;
            $('college-list').append(option);
        });
    }

    // ---------- today's patients (waiting for the doctor, and seen today) ----------
    function minutesAgo(iso) {
        const t = Date.parse(iso || '');
        return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
    }
    function waitText(iso) {
        const m = minutesAgo(iso);
        if (m == null) return '';
        if (m < 1) return 'Just arrived';
        if (m < 60) return 'Waiting ' + m + ' min';
        return 'Waiting ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
    }
    function todayRow(v, detail, extra) {
        const li = document.createElement('li');
        const hidden = !v.patientId; // a confidential visit has no ID for the nurse
        const el = document.createElement(hidden ? 'div' : 'button');
        el.className = 'as-today-row';
        if (!hidden) { el.type = 'button'; el.dataset.id = v.patientId; el.title = 'Assess ' + v.patientName; }
        const name = document.createElement('b'), what = document.createElement('small'), type = document.createElement('span');
        name.textContent = v.patientName;
        what.textContent = [v.visitType, detail].filter(Boolean).join(' \u00b7 ');
        type.className = 'pill ' + (v.visitType === 'Checkup' ? 'green' : 'yellow');
        type.textContent = extra || v.visitType;
        el.append(name, what, type);
        li.append(el);
        return li;
    }
    function fillToday(listEl, countEl, rows, emptyText) {
        countEl.textContent = rows.length ? '(' + rows.length + ')' : '';
        if (!rows.length) {
            const li = document.createElement('li');
            li.className = 'as-today-empty';
            li.textContent = emptyText;
            listEl.replaceChildren(li);
        } else listEl.replaceChildren(...rows);
    }
    let todayRun = 0;
    async function loadToday() {
        const run = ++todayRun;
        try {
            const [queue, seen] = await Promise.all([
                api.request('/api/visits/queue'),
                api.request('/api/visits?from=' + todayIso() + '&pageSize=100&excludeScreenedCopies=1')
            ]);
            if (run !== todayRun) return;
            const waiting = queue.visits.map(v => todayRow(v, v.complaint, waitText(v.createdAt) || v.visitType));
            const done = seen.visits.filter(v => v.visitDate === todayIso())
                .map(v => todayRow(v, v.diagnosis, v.visitType));
            fillToday($('wait-list'), $('wait-count'), waiting, 'No one is waiting.');
            fillToday($('seen-list'), $('seen-count'), done, 'No one seen yet today.');
            const now = new Date();
            $('today-updated').textContent = 'Updated ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } catch (error) {
            if (run !== todayRun) return;
            if (error.status === 401) window.location.assign('/index.html');
            else $('today-updated').textContent = 'Could not load. ' + error.message;
        }
    }
    async function openById(id) {
        try {
            let p = known.get(id);
            if (!p) {
                const result = await api.request('/api/patients?search=' + encodeURIComponent(id));
                result.patients.forEach(x => known.set(x.id, x));
                p = known.get(id);
            }
            if (p) await choose(p); else say('That patient was not found.', true);
        } catch (error) { fail(error); }
    }
    ['wait-list', 'seen-list'].forEach(id => $(id).addEventListener('click', event => {
        const row = event.target.closest('.as-today-row[data-id]');
        if (row) openById(row.dataset.id);
    }));
    $('refresh-today').addEventListener('click', loadToday);
    // Keep the lists fresh while the nurse is on the search view and the tab is in front.
    setInterval(() => { if (!document.hidden && !$('today-box').hidden) loadToday(); }, 30000);

    // ---------- choose / change patient ----------
    function hasDraft() {
        return ['c', 'bp', 'pulse', 'temp', 'w', 'h', 'idx'].some(id => $(id).value.trim()) || $('labs').checked;
    }
    function resetAssessment() {
        ['c', 'bp', 'pulse', 'temp', 'w', 'h', 'idx'].forEach(id => { $(id).value = ''; clearError(id); });
        $('labs').checked = false;
        document.querySelector('input[name="visitType"][value="Consultation"]').checked = true;
        updateBmi();
        setText($('send-error'), '');
    }
    async function choose(patient) {
        if (!patient) return;
        closeList();
        const run = ++selectRun;
        selected = patient;
        saved = null;
        resetAssessment();
        setText($('flow-message'), '');
        show($('find-box'), false);
        show($('today-box'), false);
        show($('done-box'), false);
        renderBar(patient);
        show($('patient-bar'), true);
        show($('history-box'), true);
        show($('past-box'), true);
        show($('triage-form'), true);
        $('history-note').textContent = 'Loading\u2026';
        $('past-note').textContent = 'Loading\u2026';
        $('history-box').open = false;
        $('past-box').open = false;
        $('open-record').href = '../nurse/record-detail.html?id=' + encodeURIComponent(patient.id);
        $('c').focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
        try {
            const [history, visits] = await Promise.all([
                api.request('/api/patients/' + encodeURIComponent(patient.id) + '/history'),
                api.request('/api/visits?search=' + encodeURIComponent(patient.id))
            ]);
            if (run !== selectRun) return; // another patient was picked meanwhile
            applyHistory(history.history, true);
            renderPast(visits.visits.filter(v => v.patientId === patient.id));
        } catch (error) {
            if (run !== selectRun) return;
            $('history-note').textContent = 'Could not load';
            $('past-note').textContent = 'Could not load';
            fail(error);
        }
    }
    function clearSelection() {
        selectRun++;
        selected = null;
        saved = null;
        ['patient-bar', 'history-box', 'past-box', 'triage-form', 'done-box'].forEach(id => show($(id), false));
        show($('find-box'), true);
        show($('today-box'), true);
        loadToday();
        resetAssessment();
        input.value = '';
        closeList();
        setText($('patient-hint'), '');
        setText($('flow-message'), '');
        input.focus();
    }
    $('change-patient').addEventListener('click', () => {
        if (hasDraft() && !window.confirm('Discard what you have typed for this patient?')) return;
        clearSelection();
    });
    $('next-patient').addEventListener('click', clearSelection);

    function renderBar(p) {
        $('bar-name').textContent = p.name || p.id;
        const age = ageOf(p.dateOfBirth);
        const course = [p.course, p.year ? 'Year ' + p.year : ''].filter(Boolean).join(' ');
        $('bar-meta').textContent = [p.id, p.college, course, age == null ? '' : age + ' years old',
            p.lastVisit ? 'Last visit ' + prettyDate(p.lastVisit) : 'No visits yet'].filter(Boolean).join('  \u00b7  ');
        renderChips(null);
    }
    function renderChips(h) {
        const chips = [];
        const add = (text, cls) => { const li = document.createElement('li'); li.className = 'pill ' + (cls || 'neutral'); li.textContent = text; chips.push(li); };
        if (h) {
            if (h.allergy) add('Allergy' + (h.allergyDetails ? ': ' + h.allergyDetails : ''), 'red');
            if (h.asthma) add('Asthma', 'yellow');
            if (h.febrileConvulsion) add('Febrile convulsion', 'yellow');
            if (h.faintingSpell) add('Fainting spell', 'yellow');
            if (h.epilepsy) add('Epilepsy', 'yellow');
            if (h.otherCondition) add(h.otherCondition);
            if (!chips.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No conditions or allergies on record'; chips.push(li); }
        }
        $('bar-chips').replaceChildren(...chips);
    }

    // ---------- register a new patient ----------
    function openRegister(open) {
        show($('register-form'), open);
        $('toggle-register').setAttribute('aria-expanded', String(open));
        if (open) {
            const typed = input.value.trim();
            if (typed && /\d/.test(typed) && !$('r-id').value) $('r-id').value = typed;
            closeList();
            $('r-id').focus();
        }
    }
    $('toggle-register').addEventListener('click', () => openRegister($('register-form').hidden));
    $('cancel-register').addEventListener('click', () => { openRegister(false); $('register-form').reset(); ['r-id', 'r-last', 'r-first'].forEach(clearError); setText($('register-error'), ''); input.focus(); });
    $('register-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        let ok = true;
        const need = (id, msg) => { if (!$(id).value.trim()) { setError(id, msg); ok = false; } else clearError(id); };
        need('r-id', 'Enter the patient ID.'); need('r-last', 'Enter the last name.'); need('r-first', 'Enter the first name.');
        if (!ok) { document.querySelector('#register-form [aria-invalid="true"]').focus(); return; }
        const button = $('save-patient');
        busy = true; button.disabled = true; setText($('register-error'), '');
        try {
            const body = {
                id: $('r-id').value.trim(), category: $('r-cat').value, lastName: $('r-last').value.trim(),
                firstName: $('r-first').value.trim(), middleName: $('r-middle').value.trim(), gender: $('r-gender').value,
                dateOfBirth: $('r-dob').value, civilStatus: $('r-civil').value, college: $('r-college').value.trim(),
                course: $('r-course').value.trim(), year: $('r-year').value.trim(), contactNumber: $('r-contact').value.trim(),
                address: $('r-address').value.trim(), guardianName: $('r-gname').value.trim(), guardianContact: $('r-gcontact').value.trim()
            };
            const result = await api.request('/api/patients', { method: 'POST', body });
            const p = { id: result.patient.id, name: result.patient.name, college: body.college || null, course: body.course || null,
                year: body.year || null, dateOfBirth: body.dateOfBirth || null, lastVisit: null };
            known.set(p.id, p);
            $('register-form').reset();
            openRegister(false);
            await choose(p);
            say('Patient registered. You can record the assessment now.');
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else setText($('register-error'), error.message);
        } finally { busy = false; button.disabled = false; }
    });

    // ---------- past visits ----------
    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null || text === '' ? '\u2014' : String(text);
        return td;
    }
    function renderPast(visits) {
        const rows = $('past-rows');
        if (!visits.length) {
            const tr = document.createElement('tr'), td = cell('No past visits.');
            td.colSpan = 5; tr.append(td); rows.replaceChildren(tr);
            $('past-note').textContent = 'None yet';
            return;
        }
        rows.replaceChildren(...visits.map(v => {
            const tr = document.createElement('tr');
            tr.append(cell(v.visitDate), cell(v.visitType), cell(v.complaint), cell(v.diagnosis), cell(v.actionsTaken));
            return tr;
        }));
        const latest = visits[0];
        $('past-note').textContent = visits.length + (visits.length === 1 ? ' visit' : ' visits') +
            (latest.visitDate ? ', latest ' + prettyDate(latest.visitDate) : '');
    }

    // ---------- medical history ----------
    const H = { asthma: 'h-asthma', allergy: 'h-allergy', febrileConvulsion: 'h-febrile', faintingSpell: 'h-fainting', epilepsy: 'h-epilepsy' };
    function readHistory() {
        const allergy = $('h-allergy').checked;
        return {
            asthma: $('h-asthma').checked, allergy, febrileConvulsion: $('h-febrile').checked,
            faintingSpell: $('h-fainting').checked, epilepsy: $('h-epilepsy').checked,
            allergyDetails: allergy ? $('h-allergy-details').value.trim() : '',
            vaccines: $('h-vaccines').value.trim(), otherCondition: $('h-other').value.trim()
        };
    }
    function applyHistory(h, fromServer) {
        Object.keys(H).forEach(key => { $(H[key]).checked = Boolean(h[key]); });
        $('h-allergy-details').value = h.allergyDetails || '';
        $('h-vaccines').value = h.vaccines || '';
        $('h-other').value = h.otherCondition || '';
        syncAllergy();
        if (fromServer) {
            saved = readHistory();
            renderChips(saved);
            // Nothing recorded yet: open the box so the nurse is prompted to ask.
            const empty = !Object.keys(H).some(k => saved[k]) && !saved.vaccines && !saved.otherCondition;
            $('history-box').open = empty;
        }
        refreshHistoryState();
    }
    function syncAllergy() { show($('h-allergy-row'), $('h-allergy').checked); }
    function historyDirty() {
        if (!saved) return false;
        const now = readHistory();
        return Object.keys(now).some(k => now[k] !== saved[k]);
    }
    function refreshHistoryState() {
        const note = $('history-note');
        if (!saved) return;
        if (historyDirty()) {
            note.textContent = 'Changes not saved yet';
            note.classList.add('unsaved');
        } else {
            note.classList.remove('unsaved');
            const flags = Object.keys(H).filter(k => saved[k]).length + (saved.otherCondition ? 1 : 0);
            note.textContent = saved.allergy ? 'Allergy: ' + (saved.allergyDetails || 'details not recorded')
                : flags ? flags + (flags === 1 ? ' condition on record' : ' conditions on record') : 'Nothing on record yet';
        }
    }
    $('history-form').addEventListener('input', () => { syncAllergy(); refreshHistoryState(); setText($('history-status'), ''); });
    async function saveHistory() {
        const body = readHistory();
        await api.request('/api/patients/' + encodeURIComponent(selected.id) + '/history', { method: 'PUT', body });
        saved = body;
        renderChips(saved);
        refreshHistoryState();
    }
    $('history-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected || busy) return;
        const button = $('save-history');
        busy = true; button.disabled = true;
        try { await saveHistory(); $('history-status').textContent = 'Saved.'; }
        catch (error) { fail(error); }
        finally { busy = false; button.disabled = false; }
    });

    // ---------- assessment ----------
    function updateBmi() {
        const kg = parseFloat($('w').value), cm = parseFloat($('h').value);
        $('b').value = kg > 0 && cm > 0 ? (kg / Math.pow(cm / 100, 2)).toFixed(1) : '';
    }
    function setError(id, text) {
        const box = $('e-' + id);
        if (box) { box.textContent = text; box.hidden = !text; }
        $(id).setAttribute('aria-invalid', 'true');
    }
    function clearError(id) {
        const box = $('e-' + id);
        if (box) { box.textContent = ''; box.hidden = true; }
        $(id).removeAttribute('aria-invalid');
    }
    // Limits mirror backend/services/visits.service.js so a mistake is caught before sending.
    function numberProblem(id, label, min, max, required) {
        const raw = $(id).value.trim();
        if (!raw) return required ? 'Enter ' + label + '.' : '';
        const n = Number(raw);
        if (!Number.isFinite(n) || n < min || n > max) return label.charAt(0).toUpperCase() + label.slice(1) + ' should be between ' + min + ' and ' + max + '.';
        return '';
    }
    function bpProblem() {
        const raw = $('bp').value.trim();
        if (!raw) return 'Enter blood pressure, for example 120/80.';
        const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(raw);
        if (!m) return 'Write it as systolic/diastolic, for example 120/80.';
        const s = Number(m[1]), d = Number(m[2]);
        if (s < 60 || s > 260 || d < 30 || d > 160 || s <= d) return 'Check the numbers: top 60 to 260, bottom 30 to 160, top higher than bottom.';
        return '';
    }
    function validate() {
        const problems = [
            ['c', $('c').value.trim() ? '' : 'Enter the reason for the visit.'],
            ['bp', bpProblem()],
            ['pulse', numberProblem('pulse', 'pulse rate', 20, 250, false)],
            ['temp', numberProblem('temp', 'body temperature', 30, 45, false)],
            ['w', numberProblem('w', 'weight', 1, 500, true)],
            ['h', numberProblem('h', 'height', 30, 300, true)]
        ];
        let first = null;
        problems.forEach(([id, text]) => {
            if (text) { setError(id, text); first = first || $(id); } else clearError(id);
        });
        return first;
    }
    ['c', 'bp', 'pulse', 'temp', 'w', 'h'].forEach(id => $(id).addEventListener('input', () => clearError(id)));
    $('w').addEventListener('input', updateBmi);
    $('h').addEventListener('input', updateBmi);

    $('triage-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected || busy) return;
        setText($('send-error'), '');
        const bad = validate();
        if (bad) { bad.focus(); setText($('send-error'), 'Fix the highlighted fields, then send again.'); return; }
        const button = $('save-triage');
        busy = true; button.disabled = true;
        const patient = selected;
        try {
            await api.getSession();
            if (historyDirty()) await saveHistory(); // never lose a ticked allergy because Save was forgotten
            const type = document.querySelector('input[name="visitType"]:checked').value;
            const result = await api.request('/api/visits/triage', {
                method: 'POST',
                body: {
                    patientId: patient.id, visitType: type, visitDate: todayIso(),
                    complaint: $('c').value.trim(), bp: $('bp').value.trim(), weight: $('w').value, height: $('h').value,
                    pulseRate: $('pulse').value, temperature: $('temp').value, initialDiagnosis: $('idx').value.trim(),
                    externalLabsAttached: $('labs').checked
                }
            });
            finish(patient, type, result.visit);
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else setText($('send-error'), error.message);
        } finally { busy = false; button.disabled = false; }
    });
    function finish(patient, type, visit) {
        resetAssessment();
        ['patient-bar', 'history-box', 'past-box', 'triage-form'].forEach(id => show($(id), false));
        $('done-text').textContent = (patient.name || patient.id) + ' \u00b7 ' + type + ' \u00b7 Visit #' + visit.id + '. The doctor can open it from the Exam Queue.';
        $('done-record').href = '../nurse/record-detail.html?id=' + encodeURIComponent(patient.id);
        selected = null; selectRun++;
        show($('done-box'), true);
        loadToday();
        window.scrollTo({ top: 0 });
        $('done-box').focus();
    }

    window.addEventListener('beforeunload', event => {
        if (selected && (hasDraft() || historyDirty())) { event.preventDefault(); event.returnValue = ''; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'nurse') {
            say('Only a nurse can record an assessment.', true);
            input.disabled = true; $('toggle-register').disabled = true;
        } else {
            // ?patient=<id> comes from the Assess buttons on Student Records.
            const wanted = new URLSearchParams(location.search).get('patient');
            if (wanted) openById(wanted);
            else { input.focus({ preventScroll: true }); loadToday(); }
        }
    }).catch(fail);
})();
