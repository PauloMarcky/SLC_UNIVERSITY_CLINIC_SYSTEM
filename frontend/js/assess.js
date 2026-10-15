/* Nurse assessment: find or register a patient, record history, review past visits, record vitals and send the patient to the doctor's queue. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const known = new Map();
    let selected = null, timer;

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
    const label = p => p.id + ' \u2014 ' + p.name;

    function resolveTyped() {
        const typed = $('psearch').value.trim().toLowerCase();
        let found = null;
        if (typed) {
            const all = [...known.values()];
            found = all.find(p => label(p).toLowerCase() === typed || p.id.toLowerCase() === typed) || null;
            if (!found) {
                const same = all.filter(p => p.name.toLowerCase() === typed);
                if (same.length === 1) found = same[0];
            }
        }
        return found;
    }
    async function selectPatient(patient) {
        const changed = !selected || !patient || selected.id !== patient.id;
        selected = patient;
        $('triage-form').hidden = !patient;
        $('history-box').hidden = !patient;
        $('past-box').hidden = !patient;
        if (patient && changed) {
            $('patient-hint').textContent = 'Selected: ' + label(patient);
            try {
                const result = await api.request('/api/patients/' + encodeURIComponent(patient.id) + '/history');
                fillHistory(result.history);
                loadPastVisits(patient);
            } catch (error) { fail(error); }
        }
    }
    async function searchPatients() {
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent($('psearch').value.trim()));
            $('patient-list').replaceChildren();
            result.patients.forEach(p => {
                known.set(p.id, p);
                const option = document.createElement('option');
                option.value = label(p);
                $('patient-list').append(option);
            });
            const found = resolveTyped();
            if (found) await selectPatient(found);
            else {
                await selectPatient(null);
                $('patient-hint').textContent = result.patients.length
                    ? 'Pick the patient from the list.'
                    : ($('psearch').value.trim() ? 'No patient found. Register a new patient below.' : '');
            }
        } catch (error) { fail(error); }
    }
    $('psearch').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(searchPatients, 250);
    });
    $('toggle-register').addEventListener('click', () => { $('register-form').hidden = !$('register-form').hidden; });

    // ---------- register ----------
    $('register-form').addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('save-patient');
        button.disabled = true;
        try {
            const body = {
                id: $('r-id').value, category: $('r-cat').value, lastName: $('r-last').value,
                firstName: $('r-first').value, middleName: $('r-middle').value, gender: $('r-gender').value,
                dateOfBirth: $('r-dob').value, civilStatus: $('r-civil').value, college: $('r-college').value,
                course: $('r-course').value, year: $('r-year').value, contactNumber: $('r-contact').value,
                address: $('r-address').value, guardianName: $('r-gname').value, guardianContact: $('r-gcontact').value
            };
            const result = await api.request('/api/patients', { method: 'POST', body });
            known.set(result.patient.id, { id: result.patient.id, name: result.patient.name });
            $('psearch').value = label(result.patient);
            $('register-form').reset();
            $('register-form').hidden = true;
            say('Patient registered.');
            await selectPatient(known.get(result.patient.id));
        } catch (error) { fail(error); }
        finally { button.disabled = false; }
    });

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

    function todayIso() {
        const n = new Date(), pad = v => String(v).padStart(2, '0');
        return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
    }
    $('triage-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected) return say('Select a patient first.', true);
        const button = $('save-triage');
        button.disabled = true;
        try {
            await api.getSession();
            const result = await api.request('/api/visits/triage', {
                method: 'POST',
                body: {
                    patientId: selected.id, visitType: $('t').value, visitDate: $('d').value || todayIso(),
                    complaint: $('c').value, bp: $('bp').value, weight: $('w').value, height: $('h').value,
                    pulseRate: $('pulse').value, temperature: $('temp').value, initialDiagnosis: $('idx').value,
                    externalLabsAttached: $('labs').checked
                }
            });
            say('Assessment saved. Visit #' + result.visit.id + ' for ' + selected.name + ' is in the doctor\u2019s queue.');
            ['c', 'bp', 'pulse', 'temp', 'w', 'h', 'idx'].forEach(id => { $(id).value = ''; });
            $('labs').checked = false;
            updateBmi();
        } catch (error) { fail(error); }
        finally { button.disabled = false; }
    });

    api.getSession().then(session => {
        if (session.user.role !== 'nurse') say('Only a nurse can record an assessment.', true);
    }).catch(fail);
})();