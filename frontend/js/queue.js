/* Doctor exam queue: pick a triaged visit, then examine it in a pop-up (findings, diagnosis, action, prescription, screening). */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const TYPES = ['Checkup', 'Consultation'];
    let visits = [];
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
            tr.append(cell(v.visitDate), cell(v.patientName + ' (' + v.patientId + ')'), typeCell(v.visitType),
                cell(v.complaint), cell(v.bp + ' ' + v.bpStatus), cell(v.bmi + ' ' + v.bmiStatus),
                cell(v.nurseName), action);
            rows.append(tr);
        });
    }

    async function loadQueue() {
        try {
            const result = await api.request('/api/visits/queue');
            visits = result.visits;
            renderTabs();
            renderRows();
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
        $('exam-summary').textContent = v.visitType + ' \u00B7 ' + v.visitDate +
            ' \u00B7 BP ' + v.bp + ' \u00B7 Weight ' + v.weightKg + ' kg \u00B7 Height ' + v.heightCm + ' cm \u00B7 BMI ' + v.bmi +
            (v.pulseRate ? ' \u00B7 Pulse ' + v.pulseRate : '') +
            (v.bodyTemperature != null ? ' \u00B7 Temp ' + v.bodyTemperature + ' \u00B0C' : '') +
            (v.initialDiagnosis ? ' \u00B7 Nurse dx: ' + v.initialDiagnosis : '') +
            (v.externalLabsAttached ? ' \u00B7 External labs attached' : '');
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
        return Boolean($('o').value.trim() || $('x').value.trim() || $('act').value.trim() ||
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
