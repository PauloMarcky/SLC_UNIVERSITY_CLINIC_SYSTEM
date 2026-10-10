(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const form = $('visit-form');
    const known = new Map();      // every patient found so far, by id
    let timer, mode = 'new', selected = null;

    const label = p => p.id + ' \u2014 ' + p.name;
    function message(text, isError) {
        $('form-message').textContent = text;
        $('form-message').hidden = !text;
        if (isError) { $('form-message').focus(); $('form-message').scrollIntoView({ block: 'center' }); }
    }
    function setMode(next) {
        mode = next;
        form.querySelectorAll('[data-mode]').forEach(el => {
            el.style.display = el.dataset.mode === mode ? '' : 'none';
        });
        $('pid').required = mode === 'new';
        $('pname').required = mode === 'new';
        $('psearch').required = mode === 'existing';
        message('');
        if (mode === 'existing') { resolveTyped(); searchPatients($('psearch').value.trim()); }
    }
    // Fills the read-only fields from the chosen patient (or clears them).
    function showSelected(patient) {
        selected = patient;
        $('xid').value = patient ? patient.id : '';
        $('xcollege').value = patient ? patient.college : '';
        $('xcourse').value = patient ? patient.course : '';
        $('xyear').value = patient ? patient.year : '';
    }
    // Typed text counts as a choice when it is a full label, an ID, or a name only one patient has.
    function resolveTyped() {
        const typed = $('psearch').value.trim().toLowerCase();
        let found = null, several = false;
        if (typed) {
            const all = [...known.values()];
            found = all.find(p => label(p).toLowerCase() === typed || p.id.toLowerCase() === typed) || null;
            if (!found) {
                const sameName = all.filter(p => p.name.toLowerCase() === typed);
                if (sameName.length === 1) found = sameName[0];
                else several = sameName.length > 1;
            }
        }
        showSelected(found);
        if (found) $('patient-hint').textContent = '';
        else if (several) $('patient-hint').textContent = 'Several patients have this name. Pick one from the list.';
        return found;
    }
    async function searchPatients(search) {
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(search));
            $('patient-list').replaceChildren();
            result.patients.forEach(p => {
                known.set(p.id, p);
                const option = document.createElement('option');
                option.value = label(p);
                $('patient-list').append(option);
            });
            if (!resolveTyped()) {
                if (!result.patients.length && $('psearch').value.trim()) {
                    $('patient-hint').textContent = 'No patient found. Choose "New patient" above to add them.';
                } else if (result.patients.length && !$('patient-hint').textContent) {
                    $('patient-hint').textContent = 'Pick the patient from the list.';
                }
            }
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else $('patient-hint').textContent = error.message;
        }
    }
    form.querySelectorAll('input[name="ptype"]').forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) setMode(radio.value); });
    });
    $('psearch').addEventListener('input', () => {
        $('patient-hint').textContent = '';
        clearTimeout(timer);
        if (resolveTyped()) return;   // already a known patient: no need to search again
        timer = setTimeout(() => searchPatients($('psearch').value.trim()), 250);
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        message('');
        let patientFields;
        if (mode === 'existing') {
            const patient = selected || resolveTyped();
            if (!patient) { message('Pick an existing patient from the list, or choose "New patient".', true); return; }
            patientFields = { patientId: patient.id, isNew: false };
        } else {
            patientFields = {
                patientId: $('pid').value.trim(), isNew: true, patientName: $('pname').value.trim(), category: $('pcat').value,
                college: $('pcollege').value, course: $('pcourse').value.trim(), year: $('pyear').value.trim()
            };
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            // clinic-api.js only sends the CSRF token after the session is loaded.
            const session = await api.getSession();
            if (session.user.role !== 'doctor') throw new Error('Only a doctor can record a visit.');
            await api.request('/api/visits', {
                method: 'POST',
                body: {
                    ...patientFields,
                    visitType: $('t').value, visitDate: $('d').value,
                    complaint: $('c').value, bp: $('bp').value, weight: $('w').value,
                    height: $('h').value, diagnosis: $('x').value, notes: $('n').value,
                    confidential: $('conf').checked
                }
            });
            window.location.assign('/doctor/visits.html');
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message, true);
            button.disabled = false;
        }
    });
    setMode('new');
})();