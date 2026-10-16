/* Add / Edit Student Record (nurse only).
   No ?id= in the address: register a new student (POST /api/patients).
   With ?id=<patient id>: edit that student (PUT /api/patients/:id). The ID cannot change.
   Past medical history is saved with PUT /api/patients/:id/history.
   Vital signs are not on this form: the nurse records them on the Assess page. */
(function () {
    'use strict';
    const form = document.getElementById('student-form');
    const api = window.ClinicAPI;
    if (!form || !api) return;
    const $ = id => document.getElementById(id);
    const editingId = new URLSearchParams(location.search).get('id');
    let saving = false;
    let exists = Boolean(editingId);   // becomes true once the student is saved, so a retry edits instead of registering again

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
    function message(text, focus) {
        const box = $('form-message');
        box.textContent = text;
        box.hidden = !text;
        box.className = 'note save-result';
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
    const radio = name => { const r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; };
    function setRadio(name, value) {
        form.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === value; });
    }

    $('dob').max = TODAY;
    $('dob').addEventListener('input', function () {
        const age = ageFrom($('dob').value);
        $('age').value = age === '' ? '' : age + ' years old';
    });

    /* ---------- history boxes that open only when ticked ---------- */
    const EXTRAS = [['allergy', 'allergy-extra'], ['vaccines', 'vaccines-extra'], ['other-cond', 'other-cond-extra']];
    function syncExtras() { EXTRAS.forEach(function (p) { $(p[1]).hidden = !$(p[0]).checked; }); }
    EXTRAS.forEach(function (p) { $(p[0]).addEventListener('change', syncExtras); });
    syncExtras();

    /* ---------- who may be here ---------- */
    function fail(error) {
        if (error.status === 401) window.location.assign('/index.html');
        else message(error.message, true);
    }
    api.getSession().then(function (session) {
        if (session.user.role !== 'nurse') window.location.replace('../nurse/medical-records.html'); // doctors are read-only
    }).catch(fail);

    /* ---------- edit mode: fill the form ---------- */
    function fillForm(p, h) {
        $('sid').value = p.id;
        $('sid').readOnly = true;
        $('last').value = p.lastName;
        $('first').value = p.firstName;
        $('middle').value = p.middleName;
        if (p.college && !Array.prototype.some.call($('dept').options, function (o) { return o.value === p.college; })) {
            const option = document.createElement('option');
            option.textContent = p.college;        // keep a department that is not in the list
            $('dept').appendChild(option);
        }
        $('dept').value = p.college;
        $('contact').value = p.contactNumber;
        setRadio('gender', p.gender);
        $('dob').value = p.dateOfBirth || '';
        $('dob').dispatchEvent(new Event('input'));
        setRadio('status', p.civilStatus);
        $('nation').value = p.nationality;
        $('course').value = p.course;
        $('year').value = p.year;
        $('guardian').value = p.guardianName;
        $('emergency').value = p.guardianContact;
        $('address').value = p.address;
        $('asthma').checked = h.asthma;
        $('allergy').checked = h.allergy;
        $('allergy-text').value = h.allergyDetails;
        $('febrile').checked = h.febrileConvulsion;
        $('fainting').checked = h.faintingSpell;
        $('epilepsy').checked = h.epilepsy;
        $('vaccines').checked = Boolean(h.vaccines);
        $('vaccine-text').value = h.vaccines;
        $('other-cond').checked = Boolean(h.otherCondition);
        $('other-text').value = h.otherCondition;
        syncExtras();
    }

    if (editingId) {
        const path = '/api/patients/' + encodeURIComponent(editingId);
        $('page-title').textContent = 'Edit Student Record';
        $('page-sub').textContent = 'The identification number cannot be changed. Vital signs are recorded on the Assess page.';
        $('save-student').textContent = 'Save changes';
        const back = '../nurse/record-detail.html?id=' + encodeURIComponent(editingId);
        $('back-link').setAttribute('href', back);
        $('back-link').innerHTML = '&lsaquo; Back to the record';
        $('cancel-link').setAttribute('href', back);
        form.hidden = true;
        Promise.all([api.request(path), api.request(path + '/history')]).then(function (results) {
            fillForm(results[0].patient, results[1].history);
            form.hidden = false;
        }).catch(fail);
    }

    /* ---------- checks ---------- */
    const ERROR_IDS = ['sid', 'last', 'first', 'dob'];
    function validate() {
        ERROR_IDS.forEach(function (id) { setError(id, ''); });
        const errors = [];
        const bad = function (id, text) { setError(id, text); errors.push(id); };
        if (!val('sid')) bad('sid', 'Enter the identification number.');
        else if (!/^[A-Za-z0-9._-]+$/.test(val('sid'))) bad('sid', 'Use only letters, numbers, dots, dashes and underscores.');
        if (!val('last')) bad('last', 'Enter the last name.');
        if (!val('first')) bad('first', 'Enter the first name.');
        const dob = $('dob').value;
        if (dob && (!isRealDate(dob) || dob >= TODAY)) bad('dob', 'Date of birth must be a real date in the past.');
        return errors;
    }
    ERROR_IDS.forEach(function (id) { $(id).addEventListener('input', function () { setError(id, ''); }); });

    /* ---------- payloads (field names match backend/flow-store.js) ---------- */
    function identityPayload() {
        return {
            lastName: val('last'),
            firstName: val('first'),
            middleName: val('middle'),
            college: $('dept').value,
            course: val('course'),
            year: val('year'),
            gender: radio('gender'),
            dateOfBirth: $('dob').value,
            civilStatus: radio('status'),
            nationality: val('nation'),
            contactNumber: val('contact'),
            address: val('address'),
            guardianName: val('guardian'),
            guardianContact: val('emergency')
        };
    }
    function historyPayload() {
        return {
            asthma: $('asthma').checked,
            allergy: $('allergy').checked,
            allergyDetails: $('allergy').checked ? val('allergy-text') : '',
            febrileConvulsion: $('febrile').checked,
            faintingSpell: $('fainting').checked,
            epilepsy: $('epilepsy').checked,
            vaccines: $('vaccines').checked ? (val('vaccine-text') || 'Yes') : '',
            otherCondition: $('other-cond').checked ? (val('other-text') || 'Yes') : ''
        };
    }

    /* ---------- save ---------- */
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (saving) return;
        message('');
        const errors = validate();
        if (errors.length) {
            message('Please fix the highlighted fields.', false);
            $(errors[0]).focus();
            $(errors[0]).scrollIntoView({ block: 'center' });
            return;
        }
        saving = true;
        const button = $('save-student');
        button.disabled = true;
        let id = editingId || val('sid');
        let stage = 'student';
        try {
            await api.getSession();                      // fresh CSRF token
            if (exists) {
                await api.request('/api/patients/' + encodeURIComponent(id), { method: 'PUT', body: identityPayload() });
            } else {
                await api.request('/api/patients', { method: 'POST', body: Object.assign({ id: id }, identityPayload()) });
                exists = true;
            }
            stage = 'history';
            await api.request('/api/patients/' + encodeURIComponent(id) + '/history', { method: 'PUT', body: historyPayload() });
            window.location.assign('../nurse/record-detail.html?id=' + encodeURIComponent(id));
        } catch (error) {
            if (error.status === 401) return window.location.assign('/index.html');
            if (stage === 'student' && error.status === 409) {
                setError('sid', 'A student with this ID already exists.');
                message('A student with this ID already exists.', true);
                $('sid').focus();
            } else if (stage === 'history') {
                message('The student was saved, but the medical history was not: ' + error.message, true);
            } else {
                message(error.message, true);
            }
            button.disabled = false;
            saving = false;
        }
    });
})();
