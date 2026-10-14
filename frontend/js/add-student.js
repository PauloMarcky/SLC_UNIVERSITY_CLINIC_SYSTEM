/* Add Student Record form (Part 3 of the student record rebuild).
   SAMPLE ONLY: "Save record" checks the form and builds the payload for POST /api/patients,
   but nothing is sent or saved. Part 6 replaces the marked block with the real API call.
   Field checks use the same limits as backend/visits-store.js. */
(function () {
    'use strict';
    const form = document.getElementById('student-form');
    if (!form) return;
    const $ = id => document.getElementById(id);

    /* ---------- helpers ---------- */
    function todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const TODAY = todayIso();
    const isRealDate = function (iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return false;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
    };
    function ageFrom(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m || !isRealDate(iso) || iso >= TODAY) return '';
        const now = new Date();
        const age = now.getFullYear() - Number(m[1]);
        const before = now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
        return before ? age - 1 : age;
    }
    function message(text, focus, kind) {
        const box = $('form-message');
        box.textContent = text;
        box.hidden = !text;
        box.className = 'note save-result' + (kind ? ' ' + kind : '');
        if (text && focus) { box.focus(); box.scrollIntoView({ block: 'center' }); }
    }
    function setError(id, text) {
        const input = $(id), box = $('e-' + id);
        if (!box) return;
        box.textContent = text;
        box.hidden = !text;
        if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    }
    const val = id => $(id).value.trim();
    const radio = name => { const r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; };

    // Dates cannot be in the future
    ['dob', 'asthma-date', 'v-date', 'f-date'].forEach(function (id) { $(id).max = TODAY; });

    /* ---------- age from date of birth ---------- */
    $('dob').addEventListener('input', function () {
        const age = ageFrom($('dob').value);
        $('age').value = age === '' ? '' : age + ' years old';
    });

    /* ---------- history boxes that open only when ticked ---------- */
    [['asthma', 'asthma-extra'], ['allergy', 'allergy-extra'], ['vaccines', 'vaccines-extra'], ['other-cond', 'other-cond-extra']]
        .forEach(function (pair) {
            const box = $(pair[0]), extra = $(pair[1]);
            const sync = function () { extra.hidden = !box.checked; };
            box.addEventListener('change', sync);
            sync();
        });

    /* ---------- examined by: use the logged-in nurse ---------- */
    if (location.protocol !== 'file:') {
        fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (s) {
                if (!s || !s.user) return;
                if (s.user.role === 'doctor') {                       // doctors are read-only on this page
                    window.location.replace('../nurse/medical-records.html');
                    return;
                }
                if (s.user.username) $('f-by').value = 'Nurse (' + s.user.username + ')';
            })
            .catch(function () { /* keep the default text */ });
    }

    /* ---------- checks ---------- */
    const ERROR_IDS = ['sid', 'last', 'first', 'dob', 'asthma-date', 'v-date', 'v-height', 'v-weight', 'v-sys', 'f-date', 'f-notes'];

    function validate() {
        ERROR_IDS.forEach(function (id) { setError(id, ''); });
        const errors = [];
        const fail = function (id, text) { setError(id, text); errors.push(id); };

        if (!val('sid')) fail('sid', 'Enter the identification number.');
        if (!val('last')) fail('last', 'Enter the last name.');
        if (!val('first')) fail('first', 'Enter the first name.');

        const dob = $('dob').value;
        if (dob && (!isRealDate(dob) || dob >= TODAY)) fail('dob', 'Date of birth must be a real date in the past.');

        if ($('asthma').checked && $('asthma-date').value && $('asthma-date').value > TODAY) {
            fail('asthma-date', 'The date cannot be in the future.');
        }

        // Vital signs: optional, but if any box is filled then all of them are needed
        const vit = { date: $('v-date').value, h: val('v-height'), w: val('v-weight'), s: val('v-sys'), d: val('v-dia') };
        if (vit.date || vit.h || vit.w || vit.s || vit.d) {
            const h = parseFloat(vit.h), w = parseFloat(vit.w), s = parseInt(vit.s, 10), d = parseInt(vit.d, 10);
            if (!vit.date) fail('v-date', 'Enter the date.');
            else if (!isRealDate(vit.date) || vit.date > TODAY) fail('v-date', 'The date cannot be in the future.');
            if (!(h >= 30 && h <= 300)) fail('v-height', 'Height must be 30 to 300 cm.');
            if (!(w >= 1 && w <= 500)) fail('v-weight', 'Weight must be 1 to 500 kg.');
            if (!(s >= 60 && s <= 260) || !(d >= 30 && d <= 160)) fail('v-sys', 'Systolic 60 to 260, diastolic 30 to 160.');
            else if (s <= d) fail('v-sys', 'Systolic must be higher than diastolic.');
        }

        // Findings: optional, but a note needs a date and a date needs a note
        const fDate = $('f-date').value, fNotes = val('f-notes');
        if (fDate || fNotes) {
            if (!fDate) fail('f-date', 'Enter the date.');
            else if (!isRealDate(fDate) || fDate > TODAY) fail('f-date', 'The date cannot be in the future.');
            if (!fNotes) fail('f-notes', 'Write the finding or note.');
        }
        return errors;
    }
    ERROR_IDS.forEach(function (id) {
        const el = $(id);
        if (el) el.addEventListener('input', function () { setError(id, ''); });
    });

    /* ---------- payload: same shape as POST /api/patients in the backend handoff ---------- */
    function buildPayload() {
        const payload = {
            id: val('sid'),
            lastName: val('last'),
            firstName: val('first'),
            middleName: val('middle'),
            college: $('dept').value,                 // shown as Department, same values
            contactNumber: val('contact'),
            gender: radio('gender'),
            dateOfBirth: $('dob').value || null,
            civilStatus: radio('status'),
            nationality: val('nation'),
            address: val('address'),
            guardianName: val('guardian'),
            emergencyContact: val('emergency'),
            history: {
                asthma: $('asthma').checked,
                asthmaLastAttack: $('asthma').checked ? ($('asthma-date').value || null) : null,
                asthmaMedicine: $('asthma').checked ? val('asthma-med') : '',
                allergy: $('allergy').checked,
                allergyFood: $('allergy').checked ? val('allergy-food') : '',
                allergyMedicine: $('allergy').checked ? val('allergy-med') : '',
                febrileConvulsion: $('febrile').checked,
                faintingSpell: $('fainting').checked,
                epilepsy: $('epilepsy').checked,
                vaccines: $('vaccines').checked,
                vaccineHepatitisB: $('vaccines').checked && $('hepb').checked,
                vaccineOther: $('vaccines').checked ? val('vaccine-other') : '',
                otherCondition: $('other-cond').checked ? val('other-text') : ''
            }
        };
        if ($('v-date').value) {
            payload.vitals = {
                entryDate: $('v-date').value,
                heightCm: parseFloat(val('v-height')),
                weightKg: parseFloat(val('v-weight')),
                systolic: parseInt(val('v-sys'), 10),
                diastolic: parseInt(val('v-dia'), 10)
            };
        }
        if ($('f-date').value) {
            payload.finding = { entryDate: $('f-date').value, notes: val('f-notes'), examinedBy: val('f-by') };
        }
        return payload;
    }

    /* ---------- save ---------- */
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        message('');
        const errors = validate();
        if (errors.length) {
            message('Please fix the highlighted fields.', false, '');
            $(errors[0]).focus();
            $(errors[0]).scrollIntoView({ block: 'center' });
            return;
        }
        const payload = buildPayload();

        /* PART 6: replace this block with the real call, e.g.
           await fetch('/api/patients', { method: 'POST', credentials: 'same-origin',
               headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
           then go to record-detail.html?id=<id>. */
        console.log('Add student (sample, not saved):', payload);
        message('Sample only: the form is valid, but nothing was saved. Saving comes when the backend is ready.', true);
    });
})();
