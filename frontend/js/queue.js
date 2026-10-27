/* Doctor exam queue: pick a triaged visit, then examine it in a pop-up (findings, diagnosis, action, prescription, screening). */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const TYPES = ['Checkup', 'Consultation'];
    let visits = [];
    let late = [];            // triaged on an earlier day, still inside the window (can be re-queued)
    let windowDays = 2;
    let filter = '';          // '' = all, otherwise 'Checkup' or 'Consultation'
    let current = null;
    let lastTrigger = null;

    function say(text, bad) {
        const box = $('flow-message');
        box.textContent = text || '';
        box.hidden = !text;
        box.classList.toggle('user-message-error', Boolean(text && bad));
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
    // "2026-10-27" -> "October 27, 2026"
    const fmt = value => (window.ClinicDate ? window.ClinicDate.format(value) : value) || '';
    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
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
            td.colSpan = 8;
            tr.append(td);
            rows.append(tr);
            return;
        }
        shown.forEach(v => {
            const tr = document.createElement('tr');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn';
            button.textContent = 'Examine';
            button.addEventListener('click', () => openExam(v, button));
            const action = document.createElement('td');
            action.append(button);
            // The blood pressure status is the doctor's call, so only the reading is shown here.
            const when = v.originalVisitDate
                ? fmt(v.visitDate) + ' (re-queued; vitals taken ' + fmt(v.originalVisitDate) + ')'
                : fmt(v.visitDate);
            tr.append(cell(when), cell(v.patientName + ' (' + v.patientId + ')'), typeCell(v.visitType),
                cell(v.complaint), cell(v.bp), cell(v.bmi + ' ' + v.bmiStatus),
                cell(v.nurseName), action);
            rows.append(tr);
        });
    }

    function renderLate() {
        const rows = $('late-rows');
        rows.replaceChildren();
        $('late-count').textContent = late.length;
        $('late-sub').textContent = 'Triaged on an earlier day and not examined. Re-queue puts the patient back in today\'s queue ' +
            'with the same vitals. After ' + windowDays + ' days the visit is removed from here and saved on the student record as missed.';
        if (!late.length) {
            const tr = document.createElement('tr');
            const td = cell('No patients waiting to be re-queued.');
            td.colSpan = 7;
            tr.append(td);
            rows.append(tr);
            return;
        }
        late.forEach(v => {
            const tr = document.createElement('tr');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn sec';
            button.textContent = 'Re-queue';
            if (!v.canRequeue) {
                button.disabled = true;
                button.title = 'This patient already has a visit in today\'s queue, or a more recent visit that did not proceed.';
            }
            button.addEventListener('click', () => requeue(v, button));
            const action = document.createElement('td');
            action.append(button);
            const left = v.daysLeft <= 1 ? 'After today' : 'In ' + v.daysLeft + ' days';
            tr.append(cell(fmt(v.originalVisitDate || v.visitDate)), cell(v.patientName + ' (' + v.patientId + ')'), typeCell(v.visitType),
                cell(v.complaint), cell(v.bp), cell(left), action);
            rows.append(tr);
        });
    }

    async function requeue(v, button) {
        button.disabled = true;
        try {
            await api.getSession();
            await api.request('/api/visits/' + v.id + '/requeue', { method: 'POST', body: {} });
            say(v.patientName + ' is back in today\'s queue.');
            await loadQueue();
        } catch (error) {
            fail(error);
            await loadQueue();   // the list may have changed (for example the visit was just saved as missed)
        }
    }

    async function loadQueue() {
        try {
            const result = await api.request('/api/visits/queue');
            visits = result.visits;
            late = result.didNotProceed || [];
            windowDays = result.windowDays || windowDays;
            renderTabs();
            renderRows();
            renderLate();
        } catch (error) { fail(error); }
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
    function openExam(v, trigger) {
        current = v;
        lastTrigger = trigger || null;
        $('exam-form').reset();
        if (window.PrescriptionBuilder) window.PrescriptionBuilder.reset();
        sayInModal('');
        say('');
        $('exam-title').textContent = 'Examination: ' + v.patientName + ' (visit #' + v.id + ')';
        $('exam-summary').textContent = v.visitType + ' \u00B7 ' + fmt(v.visitDate) +
            (v.originalVisitDate ? ' \u00B7 Vitals taken ' + fmt(v.originalVisitDate) : '') +
            ' \u00B7 BP ' + v.bp + ' \u00B7 Weight ' + v.weightKg + ' kg \u00B7 Height ' + v.heightCm + ' cm \u00B7 BMI ' + v.bmi +
            (v.pulseRate ? ' \u00B7 Pulse ' + v.pulseRate : '') +
            (v.bodyTemperature != null ? ' \u00B7 Temp ' + v.bodyTemperature + ' \u00B0C' : '') +
            (v.initialDiagnosis ? ' \u00B7 Nurse dx: ' + v.initialDiagnosis : '') +
            (v.labSourceName
                ? ' \u00B7 Outside lab: ' + v.labSourceName + (v.labSourceLocation ? ', ' + v.labSourceLocation : '') + (v.labReceivedAt ? ' (received ' + fmt(v.labReceivedAt) + ')' : '')
                : v.externalLabsAttached ? ' \u00B7 External labs attached' : '');
        $('purpose').value = v.complaint || '';
        // Screening is only for a Checkup, and its note only appears once the box is ticked.
        $('screen-box').hidden = v.visitType !== 'Checkup';
        $('screen-note-wrap').hidden = true;
        $('rx-builder').closest('section').hidden = v.visitType === 'Checkup';
        $('exam-modal').hidden = false;
        document.body.classList.add('modal-open');
        $('o').focus();
    }

    function hasInput() {
        const rx = window.PrescriptionBuilder;
        return Boolean($('bps').value.trim() || $('o').value.trim() || $('x').value.trim() || $('act').value.trim() ||
            $('screen').checked ||
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

    // In-page confirmation modal (replaces the browser's window.confirm).
    function askDiscard() {
        return new Promise(resolve => {
            const box = $('confirm-modal');
            const yes = $('confirm-yes');
            const no = $('confirm-no');
            function done(result) {
                box.hidden = true;
                box.removeEventListener('click', onClick);
                document.removeEventListener('keydown', onKey, true);
                yes.removeEventListener('click', onYes);
                resolve(result);
            }
            function onYes() { done(true); }
            function onClick(event) { if (event.target.closest('[data-confirm-no]')) done(false); }
            function onKey(event) {
                if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); done(false); }
            }
            yes.addEventListener('click', onYes);
            box.addEventListener('click', onClick);
            document.addEventListener('keydown', onKey, true);
            box.hidden = false;
            no.focus();
        });
    }

    // Closing with typed text asks first, so a stray click or Escape does not lose the examination.
    async function requestClose() {
        if (!current) return;
        if (!$('confirm-modal').hidden) return;
        if (hasInput() && !(await askDiscard())) return;
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
        if (current && current.visitType === 'Checkup') {
            $('rx-builder').closest('section').hidden = !$('screen').checked;
            if ($('screen').checked) {
                requestAnimationFrame(function () {
                    $('rx-builder').closest('section').scrollIntoView({ behavior: 'smooth', block: 'end' });
                });
            }
            if (!$('screen').checked && window.PrescriptionBuilder) window.PrescriptionBuilder.reset();
        }
    });
    $('refresh').addEventListener('click', loadQueue);

    $('exam-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!current) return;
        if (!$('x').value.trim()) { $('x').focus(); return sayInModal('Enter the clinical diagnosis.'); }
        const rx = window.PrescriptionBuilder;
        const rxOn = !$('rx-builder').closest('section').hidden;
        const rxError = rx && rxOn ? rx.validate() : '';
        if (rxError) return sayInModal(rxError);
        // (temporary element check removed)
        // (temporary element check removed)
        const screening = current.visitType === 'Checkup' && $('screen').checked;
        const button = $('complete');
        button.disabled = true;
        try {
            await api.getSession();
            await api.request('/api/visits/' + current.id + '/complete', {
                method: 'POST',
                body: {
                    diagnosis: $('x').value, soapObjective: $('o').value, actionsTaken: $('act').value,
                    bpStatus: $('bps').value,   // identified by the doctor
                    sentToHospital: false, confidential: false,
                    putToScreening: screening, screenedNote: screening ? $('screen-note').value : '',
                    prescription: rx && rxOn ? rx.getPayload() : null
                }
            });
            const done = current.id;
            closeExam();
            say('Visit #' + done + ' completed.');
            await loadQueue();
        } catch (error) { fail(error); }
        finally { button.disabled = false; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'doctor') return say('Only a doctor can use the exam queue.', true);
        loadQueue();
    }).catch(fail);
})();
