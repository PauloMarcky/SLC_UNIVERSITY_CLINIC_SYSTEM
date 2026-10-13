/* New Consultation / Checkup form.
   Patient: new or existing (existing patients are looked up from /api/patients).
   Also: live BMI, field checks that mirror the server rules, confidential helper.
   "Save visit" posts to /api/visits (doctor only) and goes back to the visits list. */
(function () {
    'use strict';
    const form = document.getElementById('consult-form');
    if (!form) return;
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const known = new Map();            // every patient found so far, by id
    const weight = $('w'), height = $('h'), bmi = $('b');
    const dx = $('x'), conf = $('conf');
    const BMI_HINT = 'Enter weight and height';
    let mode = 'new', selected = null, timer, confChoice = false;

    /* ---------- messages ---------- */
    function message(text, focus) {
        const box = $('form-message');
        box.textContent = text;
        box.hidden = !text;
        if (text && focus) { box.focus(); box.scrollIntoView({ block: 'center' }); }
    }
    function setError(id, text) {
        const input = $(id), box = $('e-' + id);
        box.textContent = text;
        box.hidden = !text;
        if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }

    /* ---------- live BMI ---------- */
    function updateBmi() {
        const kg = parseFloat(weight.value), cm = parseFloat(height.value);
        bmi.value = kg > 0 && cm > 0 ? (kg / Math.pow(cm / 100, 2)).toFixed(1) : BMI_HINT;
    }
    weight.addEventListener('input', updateBmi);
    height.addEventListener('input', updateBmi);

    /* ---------- confidential helper ---------- */
    function syncConf() {
        const mental = dx.value.indexOf('Mental health') === 0;
        conf.checked = mental ? true : confChoice;
        conf.disabled = mental;          // the server always saves mental health as confidential
    }
    conf.addEventListener('change', function () { confChoice = conf.checked; });
    dx.addEventListener('change', syncConf);

    /* ---------- patient: new or existing ---------- */
    const label = p => p.id + ' \u2014 ' + p.name;
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
            result.patients.forEach(function (p) {
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

    /* ---------- field checks (same limits as the server) ---------- */
    const rules = [
        ['psearch', () => resolveTyped() ? '' : 'Pick an existing patient from the list, or choose "New patient".', 'existing'],
        ['pid', v => !v.trim() ? 'Enter the patient ID.'
            : /^[A-Za-z0-9._-]+$/.test(v.trim()) ? '' : 'Use only letters, numbers, dots, dashes and underscores.', 'new'],
        ['pname', v => v.trim() ? '' : 'Enter the patient\u2019s full name.', 'new'],
        ['c', v => v.trim() ? '' : 'Enter the complaint or reason for the visit.'],
        ['bp', function (v) {
            const m = /^(\d{2,3})\/(\d{2,3})$/.exec(v.trim());
            if (!m) return 'Use the format 120/80.';
            const s = Number(m[1]), d = Number(m[2]);
            return s >= 60 && s <= 260 && d >= 30 && d <= 160 && s > d ? '' : 'Enter a realistic blood pressure, such as 120/80.';
        }],
        ['w', v => parseFloat(v) >= 1 && parseFloat(v) <= 500 ? '' : 'Enter the weight in kg (1 to 500).'],
        ['h', v => parseFloat(v) >= 30 && parseFloat(v) <= 300 ? '' : 'Enter the height in cm (30 to 300).'],
        ['x', v => v ? '' : 'Select a diagnosis category.']
    ];
    const active = rule => !rule[2] || rule[2] === mode;
    rules.forEach(function (rule) {
        const input = $(rule[0]);
        const recheck = function () { if (input.getAttribute('aria-invalid')) setError(rule[0], rule[1](input.value)); };
        input.addEventListener('input', recheck);
        input.addEventListener('change', recheck);
    });

    function setMode(next) {
        mode = next;
        form.querySelectorAll('[data-mode]').forEach(function (el) {
            el.style.display = el.dataset.mode === mode ? '' : 'none';
        });
        rules.filter(rule => rule[2] && !active(rule)).forEach(rule => setError(rule[0], ''));
        message('');
        if (mode === 'existing') { resolveTyped(); searchPatients($('psearch').value.trim()); }
    }
    form.querySelectorAll('input[name="ptype"]').forEach(function (radio) {
        radio.addEventListener('change', function () { if (radio.checked) setMode(radio.value); });
    });
    $('psearch').addEventListener('input', function () {
        $('patient-hint').textContent = '';
        clearTimeout(timer);
        if (resolveTyped()) return;      // already a known patient: no need to search again
        timer = setTimeout(function () { searchPatients($('psearch').value.trim()); }, 250);
    });

    /* ---------- save ---------- */
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        message('');
        let first = null;
        rules.filter(active).forEach(function (rule) {
            const text = rule[1]($(rule[0]).value);
            setError(rule[0], text);
            if (text && !first) first = $(rule[0]);
        });
        if (first) { first.focus(); return; }

        // Prescription: stop if a medicine was typed but never added to the list.
        const rxBuilder = window.PrescriptionBuilder;
        const rxError = rxBuilder ? rxBuilder.validate() : '';
        if (rxError) { message(rxError, true); return; }

        const patientFields = mode === 'existing'
            ? { patientId: selected.id, isNew: false }
            : {
                patientId: $('pid').value.trim(), isNew: true, patientName: $('pname').value.trim(),
                category: $('pcat').value, college: $('pcollege').value,
                course: $('pcourse').value.trim(), year: $('pyear').value.trim()
            };
        const button = $('save-visit');
        button.disabled = true;
        try {
            // clinic-api.js only sends the CSRF token after the session is loaded.
            const session = await api.getSession();
            if (session.user.role !== 'doctor') throw new Error('Only a doctor can record a visit.');
            await api.request('/api/visits', {
                method: 'POST',
                body: Object.assign({}, patientFields, {
                    visitType: $('t').value, visitDate: $('d').value, complaint: $('c').value,
                    bp: $('bp').value, weight: $('w').value, height: $('h').value,
                    diagnosis: dx.value, notes: $('n').value, confidential: conf.checked,
                    prescription: rxBuilder ? rxBuilder.getPayload() : null   // null = nothing prescribed
                })
            });
            window.location.assign('/doctor/visits.html?saved=1');
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message, true);
            button.disabled = false;
        }
    });

    setMode('new');
    syncConf();
    updateBmi();
})();