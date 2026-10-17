/* Doctor exam queue: pick a triaged visit, then examine it in a pop-up (vitals, findings, diagnosis, action, prescription, screening). */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const TYPES = ['Checkup', 'Consultation'];
    let visits = [];
    let filter = '';          // '' = all, otherwise 'Checkup' or 'Consultation'
    let current = null;
    let lastTrigger = null;
    let sayTimer = null;
    const REFRESH_MS = 30000;   // the list refreshes itself while no exam is open

    function say(text, bad, good) {
        const box = $('flow-message');
        box.textContent = text || '';
        box.hidden = !text;
        box.classList.toggle('user-message-error', Boolean(text && bad));
        box.classList.toggle('is-success', Boolean(text && good));
        clearTimeout(sayTimer);
        if (text && good) sayTimer = setTimeout(() => say(''), 8000);
        if (text) box.focus();
    }
    function sayInModal(text) {
        const box = $('exam-message');
        box.textContent = text || '';
        box.hidden = !text;
        if (text) box.focus();
    }
    function fail(error) {
        if (error.status === 401) window.location.assign('/index.html');
        else if (current) sayInModal(error.message);
        else say(error.message, true);
    }
    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        return td;
    }
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }
    function clockTime(date) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    // Arrival time comes from the visit's created time; falls back to the visit date if it cannot be read.
    function arrival(v) {
        const t = Date.parse(v.createdAt);
        if (Number.isNaN(t)) return { time: v.visitDate, wait: '' };
        const at = new Date(t);
        const today = new Date();
        const sameDay = at.toDateString() === today.toDateString();
        const time = (sameDay ? '' : at.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ') + clockTime(at);
        const minutes = Math.max(0, Math.floor((Date.now() - t) / 60000));
        let wait;
        if (minutes < 1) wait = 'Just now';
        else if (minutes < 60) wait = minutes + ' min';
        else if (minutes < 1440) wait = Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
        else { const d = Math.floor(minutes / 1440); wait = d + (d === 1 ? ' day' : ' days'); }
        return { time, wait };
    }
    function abnormal(status) { return status && status !== 'Normal' ? status : ''; }

    function arrivedCell(v) {
        const td = document.createElement('td');
        const a = arrival(v);
        td.append(el('span', 'q-main', a.time));
        if (a.wait) td.append(el('span', 'q-sub', a.wait === 'Just now' ? a.wait : 'waiting ' + a.wait));
        return td;
    }
    function patientCell(v) {
        const td = document.createElement('td');
        td.append(el('span', 'q-name', v.patientName), el('span', 'q-sub', 'ID ' + v.patientId));
        return td;
    }
    // Normal values stay plain; an abnormal one is tinted and says why in words (not colour alone).
    function vitalCell(value, status) {
        const td = document.createElement('td');
        td.append(el('span', 'q-main', value));
        const flag = abnormal(status);
        if (flag) {
            td.classList.add('is-abnormal');
            td.append(el('span', 'vital-flag', flag));
        }
        return td;
    }
    function typeCell(type) {
        const td = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'pill ' + (type === 'Checkup' ? 'green' : 'yellow');
        badge.textContent = type;
        td.append(badge);
        return td;
    }

    function renderTabs() {
        const box = $('type-tabs');
        box.replaceChildren();
        [['', 'All', visits.length]].concat(TYPES.map(t => [t, t, visits.filter(v => v.visitType === t).length]))
            .forEach(([value, label, count]) => {
                const tab = document.createElement('a');
                tab.href = '#';
                tab.dataset.type = value;
                tab.textContent = label + ' ' + count;
                if (value === filter) { tab.className = 'on'; tab.setAttribute('aria-current', 'true'); }
                box.append(tab);
            });
    }

    function renderRows() {
        const rows = $('queue-rows');
        rows.replaceChildren();
        $('queue-count').textContent = visits.length;
        const shown = filter ? visits.filter(v => v.visitType === filter) : visits;
        if (!shown.length) {
            const tr = document.createElement('tr');
            const td = cell(filter ? 'No ' + filter.toLowerCase() + ' patients waiting.' : 'No patients waiting.');
            td.colSpan = 7;
            tr.append(td);
            rows.append(tr);
            return;
        }
        shown.forEach(v => {
            const tr = document.createElement('tr');
            tr.className = 'queue-row';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn';
            button.textContent = 'Examine';
            button.addEventListener('click', () => openExam(v, button));
            const action = document.createElement('td');
            action.append(button);
            tr.append(arrivedCell(v), patientCell(v), typeCell(v.visitType),
                cell(v.complaint), vitalCell(v.bp, v.bpStatus), vitalCell(v.bmi, v.bmiStatus), action);
            // The whole row opens the exam, not just the button.
            tr.addEventListener('click', event => {
                if (!event.target.closest('button')) openExam(v, button);
            });
            rows.append(tr);
        });
    }

    async function loadQueue(quiet) {
        try {
            const result = await api.request('/api/visits/queue');
            visits = result.visits;
            renderTabs();
            renderRows();
            $('queue-updated').textContent = 'Updated ' + clockTime(new Date());
        } catch (error) {
            // A failed automatic refresh keeps the last list and says so quietly.
            if (quiet === true && error.status !== 401) {
                $('queue-updated').textContent = 'Could not refresh. Showing the last list.';
                return;
            }
            fail(error);
        }
    }

    $('type-tabs').addEventListener('click', event => {
        const tab = event.target.closest('a[data-type]');
        if (!tab) return;
        event.preventDefault();
        filter = tab.dataset.type;
        renderTabs();
        renderRows();
    });

    // ---------- Examine pop-up ----------
    // Only BP and BMI are tinted: the server labels them; there are no confirmed ranges for temperature or pulse.
    function renderVitals(v) {
        const box = $('exam-vitals');
        box.replaceChildren();
        const tile = (label, value, status) => {
            const flag = abnormal(status);
            const node = el('div', 'vital' + (flag ? ' is-abnormal' : ''));
            node.append(el('span', 'vital-label', label), el('strong', 'vital-value', value));
            if (flag) node.append(el('span', 'vital-flag', flag));
            return node;
        };
        box.append(
            tile('BP', v.bp, v.bpStatus),
            tile('Temp', v.bodyTemperature != null ? Number(v.bodyTemperature).toFixed(1) + ' \u00B0C' : '\u2014'),
            tile('Pulse', v.pulseRate ? v.pulseRate + ' bpm' : '\u2014'),
            tile('Weight', v.weightKg + ' kg'),
            tile('Height', v.heightCm + ' cm'),
            tile('BMI', v.bmi, v.bmiStatus)
        );
    }

    // Quick-fill: fills an empty box, or adds to what is already typed. The doctor can edit it afterwards.
    function fillField(id, text) {
        if (!text) return;
        const box = $(id);
        const typed = box.value.trim();
        if (!typed) box.value = text;
        else if (!typed.includes(text)) box.value = box.value.replace(/\s+$/, '') + (id === 'x' ? '; ' : '\n') + text;
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
    }

    function openExam(v, trigger) {
        current = v;
        lastTrigger = trigger || null;
        $('exam-form').reset();
        if (window.PrescriptionBuilder) window.PrescriptionBuilder.reset();
        sayInModal('');
        say('');
        $('exam-title').textContent = 'Examination: ' + v.patientName + ' (visit #' + v.id + ')';
        const a = arrival(v);
        $('exam-summary').textContent = [v.visitType, v.visitDate, a.time ? 'Arrived ' + a.time : '',
            v.externalLabsAttached ? 'External labs attached' : ''].filter(Boolean).join(' \u00B7 ');
        renderVitals(v);
        $('nurse-dx-text').textContent = v.initialDiagnosis || '';
        $('nurse-dx').hidden = !v.initialDiagnosis;
        $('purpose').textContent = v.complaint || '\u2014';
        // Screening is only for a Checkup; its note appears once the box is ticked.
        $('screen-label').hidden = v.visitType !== 'Checkup';
        $('chip-no-illness').hidden = v.visitType !== 'Checkup';
        $('screen-note-wrap').hidden = true;
        $('exam-modal').hidden = false;
        document.body.classList.add('modal-open');
        // Start at the top (vitals first); focusing the findings box must not scroll them out of view.
        document.querySelector('#exam-modal .modal-card').scrollTop = 0;
        $('o').focus({ preventScroll: true });
    }

    function hasInput() {
        const rx = window.PrescriptionBuilder;
        return Boolean($('o').value.trim() || $('x').value.trim() || $('act').value.trim() ||
            $('hosp').checked || $('conf').checked || $('screen').checked ||
            (rx && rx.getPayload()));
    }

    function closeExam() {
        $('exam-modal').hidden = true;
        document.body.classList.remove('modal-open');
        current = null;
        sayInModal('');
        if (lastTrigger && document.body.contains(lastTrigger)) lastTrigger.focus();
        lastTrigger = null;
    }

    // Closing with typed text asks first, so a stray click or Escape does not lose the examination.
    function requestClose() {
        if (!current) return;
        if (hasInput() && !window.confirm('Discard this examination? What you typed will be lost.')) return;
        closeExam();
    }

    $('exam-modal').addEventListener('click', event => {
        if (event.target.closest('[data-close-exam]')) requestClose();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !$('exam-modal').hidden) requestClose();
    });
    $('screen').addEventListener('change', () => {
        $('screen-note-wrap').hidden = !$('screen').checked;
        if ($('screen').checked) $('screen-note').focus();
    });
    $('refresh').addEventListener('click', () => loadQueue(false));
    $('exam-form').addEventListener('click', event => {
        const chip = event.target.closest('.chip[data-fill]');
        if (chip) fillField(chip.dataset.fill, chip.dataset.text);
    });
    $('use-nurse-dx').addEventListener('click', () => {
        if (current) fillField('x', current.initialDiagnosis);
    });

    $('exam-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!current) return;
        if (!$('x').value.trim()) { $('x').focus(); return sayInModal('Enter the clinical diagnosis.'); }
        const rx = window.PrescriptionBuilder;
        const rxError = rx ? rx.validate() : '';
        if (rxError) return sayInModal(rxError);
        const screening = current.visitType === 'Checkup' && $('screen').checked;
        const button = $('complete');
        button.disabled = true;
        button.textContent = 'Saving\u2026';
        try {
            await api.getSession();
            await api.request('/api/visits/' + current.id + '/complete', {
                method: 'POST',
                body: {
                    diagnosis: $('x').value, soapObjective: $('o').value, actionsTaken: $('act').value,
                    sentToHospital: $('hosp').checked, confidential: $('conf').checked,
                    putToScreening: screening, screenedNote: screening ? $('screen-note').value : '',
                    prescription: rx ? rx.getPayload() : null
                }
            });
            const done = current.id, who = current.patientName;
            closeExam();
            say('Visit #' + done + ' completed: ' + who, false, true);
            await loadQueue(false);
        } catch (error) { fail(error); }
        finally { button.disabled = false; button.textContent = 'Complete visit'; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'doctor') return say('Only a doctor can use the exam queue.', true);
        loadQueue(false);
        // Refresh every 30 seconds, but never while an exam is open or the tab is hidden.
        setInterval(() => { if (!document.hidden && !current) loadQueue(true); }, REFRESH_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && !current) loadQueue(true); });
    }).catch(fail);
})();
