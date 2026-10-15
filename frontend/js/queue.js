/* Doctor exam queue: open a triaged visit, record SOAP notes, diagnosis, prescription, and optional Screening. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    let current = null;

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
    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        return td;
    }

    async function loadQueue() {
        try {
            const result = await api.request('/api/visits/queue');
            const rows = $('queue-rows');
            rows.replaceChildren();
            $('queue-count').textContent = result.visits.length;
            if (!result.visits.length) {
                const tr = document.createElement('tr');
                const td = cell('No patients waiting.');
                td.colSpan = 8;
                tr.append(td);
                rows.append(tr);
                return;
            }
            result.visits.forEach(v => {
                const tr = document.createElement('tr');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn';
                button.textContent = 'Examine';
                button.addEventListener('click', () => openExam(v));
                const action = document.createElement('td');
                action.append(button);
                tr.append(cell(v.visitDate), cell(v.patientName + ' (' + v.patientId + ')'), cell(v.visitType),
                    cell(v.complaint), cell(v.bp + ' ' + v.bpStatus), cell(v.bmi + ' ' + v.bmiStatus),
                    cell(v.nurseName), action);
                rows.append(tr);
            });
        } catch (error) { fail(error); }
    }

    function openExam(v) {
        current = v;
        $('exam-form').reset();
        if (window.PrescriptionBuilder) window.PrescriptionBuilder.reset();
        $('exam-title').textContent = 'Examination: ' + v.patientName + ' (visit #' + v.id + ')';
        $('exam-summary').textContent = v.visitType + ' \u00B7 ' + v.visitDate + ' \u00B7 Complaint: ' + v.complaint +
            ' \u00B7 BP ' + v.bp + ' \u00B7 Weight ' + v.weightKg + ' kg \u00B7 Height ' + v.heightCm + ' cm \u00B7 BMI ' + v.bmi +
            (v.pulseRate ? ' \u00B7 Pulse ' + v.pulseRate : '') +
            (v.initialDiagnosis ? ' \u00B7 Nurse dx: ' + v.initialDiagnosis : '') +
            (v.externalLabsAttached ? ' \u00B7 External labs attached' : '');
        $('screen-box').hidden = v.visitType !== 'Checkup';
        $('exam-form').hidden = false;
        $('exam-form').scrollIntoView({ block: 'start' });
        $('x').focus();
        syncConfidential();
    }

    function syncConfidential() {
        const mental = $('x').value.indexOf('Mental health') === 0;
        if (mental) $('conf').checked = true;
        $('conf').disabled = mental;
    }
    $('x').addEventListener('change', syncConfidential);
    $('cancel').addEventListener('click', () => { current = null; $('exam-form').hidden = true; });
    $('refresh').addEventListener('click', loadQueue);

    $('exam-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!current) return;
        if (!$('x').value) { $('x').focus(); return say('Select the final diagnosis category.', true); }
        const rx = window.PrescriptionBuilder;
        const rxError = rx ? rx.validate() : '';
        if (rxError) return say(rxError, true);
        const button = $('complete');
        button.disabled = true;
        try {
            await api.getSession();
            await api.request('/api/visits/' + current.id + '/complete', {
                method: 'POST',
                body: {
                    diagnosis: $('x').value, soapSubjective: $('s').value, soapObjective: $('o').value,
                    soapAssessment: $('a').value, soapPlan: $('p').value, actionsTaken: $('act').value,
                    notes: $('n').value, sentToHospital: $('hosp').checked, confidential: $('conf').checked,
                    putToScreening: current.visitType === 'Checkup' && $('screen').checked,
                    screenedNote: $('screen-note').value,
                    prescription: rx ? rx.getPayload() : null
                }
            });
            say('Visit #' + current.id + ' completed.');
            current = null;
            $('exam-form').hidden = true;
            await loadQueue();
        } catch (error) { fail(error); }
        finally { button.disabled = false; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'doctor') return say('Only a doctor can use the exam queue.', true);
        loadQueue();
    }).catch(fail);
})();