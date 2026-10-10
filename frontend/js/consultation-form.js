(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const form = $('visit-form');
    let patients = [], timer, mode = 'new';

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
        $('pname').required = mode === 'new';
        $('psearch').required = mode === 'existing';
        message('');
        if (mode === 'existing') searchPatients($('psearch').value.trim());
    }
    async function searchPatients(search) {
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(search));
            patients = result.patients;
            $('patient-list').replaceChildren();
            patients.forEach(p => {
                const option = document.createElement('option');
                option.value = label(p);
                $('patient-list').append(option);
            });
            $('patient-hint').textContent = patients.length ? ''
                : 'No patient found. Choose "New patient" above to add them.';
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else $('patient-hint').textContent = error.message;
        }
    }
    form.querySelectorAll('input[name="ptype"]').forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) setMode(radio.value); });
    });
    $('psearch').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => searchPatients($('psearch').value.trim()), 250);
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        message('');
        let patientFields;
        if (mode === 'existing') {
            const typed = $('psearch').value.trim();
            const selected = patients.find(p => label(p) === typed || p.id === typed);
            if (!selected) { message('Pick an existing patient from the list, or choose "New patient".', true); return; }
            patientFields = { patientId: selected.id };
        } else {
            patientFields = {
                patientId: '', patientName: $('pname').value.trim(), category: $('pcat').value,
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