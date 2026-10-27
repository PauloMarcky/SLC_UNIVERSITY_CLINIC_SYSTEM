/* Add / Edit Student Record (nurses add and edit; doctors can only add).
   No ?id= in the address: register a new student (POST /api/patients).
   With ?id=<patient id>: edit that student (PUT /api/patients/:id). The ID cannot change.
   Past medical history is saved with PUT /api/patients/:id/history, and the laboratory requirements with
   PUT /api/patients/:id/requirements. Both belong to the student, so they carry over from year to year.
   Typing the ID of a student who is already in the system (from an earlier school year) fills the form with
   their saved record; saving then enrolls them in the current school year and keeps their history and requirements.
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
    let role = '';
    let known = null;                  // what the form was filled from when the typed ID matched a student already in the system
    let lookupTicket = 0;

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

    if (window.SLCDepartments) window.SLCDepartments.fillSelect($('dept'), { short: true });
    // The department follows the course until the nurse picks one by hand.
    let deptByHand = false;
    $('dept').addEventListener('change', function () { deptByHand = true; });
    $('course').addEventListener('input', function () {
        if (deptByHand || !window.SLCDepartments) return;
        const d = window.SLCDepartments.forCourse($('course').value);
        if (!d) { $('dept').value = ''; return; }
        if (!Array.prototype.some.call($('dept').options, function (o) { return o.value === d; })) {
            const option = document.createElement('option');
            option.value = d;
            option.textContent = window.SLCDepartments.short(d);
            $('dept').appendChild(option);
        }
        $('dept').value = d;
    });

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

    /* ---------- laboratory requirements ---------- */
    const REQ_BOXES = Array.prototype.slice.call(form.querySelectorAll('[data-req]'));
    // The pregnancy test does not apply to male students: its box is greyed out and left unchanged.
    function syncPregnancy() {
        const male = radio('gender') === 'Male';
        $('req-pregnancyTest').disabled = male;
        $('req-pregnancyTest-label').classList.toggle('na', male);
        $('req-na').hidden = !male;
    }
    form.querySelectorAll('input[name="gender"]').forEach(function (r) { r.addEventListener('change', syncPregnancy); });
    function requirementsPayload() {
        const out = {};
        REQ_BOXES.forEach(function (box) { if (!box.disabled) out[box.dataset.req] = box.checked; });
        return out;
    }
    function fillRequirements(items) {
        const done = {};
        items.forEach(function (i) { done[i.key] = i; });
        REQ_BOXES.forEach(function (box) {
            const item = done[box.dataset.req];
            box.checked = Boolean(item && item.done);
            box.title = item && item.done && item.date ? 'Done on ' + item.date : '';
        });
    }
    syncPregnancy();

    /* ---------- who may be here ---------- */
    function fail(error) {
        if (error.status === 401) window.location.assign('/index.html');
        else message(error.message, true);
    }
    api.getSession().then(function (session) {
        role = session.user.role;
        if (session.user.role !== 'nurse' && !(session.user.role === 'doctor' && !editingId)) window.location.replace('../nurse/medical-records.html'); // doctors may add a student but not edit one
    }).catch(fail);

    /* ---------- edit mode: fill the form ---------- */
    function fillForm(p, h, requirementItems, lockId) {
        $('sid').value = p.id;
        if (lockId) $('sid').readOnly = true;
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
        fillRequirements(requirementItems || []);
        syncPregnancy();
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
        Promise.all([api.request(path), api.request(path + '/history'), api.request(path + '/requirements')]).then(function (results) {
            fillForm(results[0].patient, results[1].history, results[2].requirements.items, true);
            form.hidden = false;
        }).catch(fail);
    }

    /* ---------- a student who is already in the system (from an earlier school year) ---------- */
    const note = $('existing-note');
    function clearExisting() {
        known = null;
        note.hidden = true;
        note.textContent = '';
        $('save-student').disabled = false;
    }
    async function lookupExisting() {
        if (editingId || exists) return;
        const id = val('sid');
        const mine = ++lookupTicket;
        if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) { clearExisting(); return; }
        try {
            const path = '/api/patients/' + encodeURIComponent(id);
            let found;
            try { found = await api.request(path); }
            catch (error) { if (error.status === 404) found = null; else throw error; }
            if (mine !== lookupTicket) return;
            if (!found) { clearExisting(); return; }
            const results = await Promise.all([
                api.request(path + '/history'),
                api.request(path + '/requirements'),
                api.request('/api/patients?search=' + encodeURIComponent(id) + '&limit=5&offset=0&schoolYear=current'),
                api.request('/api/school-years')
            ]);
            if (mine !== lookupTicket) return;
            fillForm(found.patient, results[0].history, results[1].requirements.items, false);
            known = { history: JSON.stringify(historyPayload()), requirements: JSON.stringify(requirementsPayload()) };
            const current = (results[3].schoolYears || []).find(function (y) { return y.id === results[3].currentId; });
            const label = current ? current.label : 'the current school year';
            const already = results[2].patients.some(function (p) { return String(p.id).toLowerCase() === id.toLowerCase(); });
            note.hidden = false;
            note.textContent = '';
            if (already) {
                note.appendChild(document.createTextNode('This student is already enrolled in school year ' + label + '. To change the record, open it and use Edit record. '));
                const link = document.createElement('a');
                link.href = '../nurse/record-detail.html?id=' + encodeURIComponent(found.patient.id);
                link.textContent = 'Open the record';
                note.appendChild(link);
            } else {
                note.textContent = 'This student is already in the system. Saving will enroll them in school year ' + label +
                    ' and keep their medical history and laboratory requirements.';
            }
            $('save-student').disabled = already;
        } catch (error) {
            if (mine === lookupTicket) { clearExisting(); if (error.status === 401) window.location.assign('/index.html'); }
        }
    }
    if (!editingId) {
        $('sid').addEventListener('change', lookupExisting);
        $('sid').addEventListener('input', function () { if (known || !note.hidden) clearExisting(); });
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
            let reEnrolled = false;
            if (exists) {
                await api.request('/api/patients/' + encodeURIComponent(id), { method: 'PUT', body: identityPayload() });
            } else {
                const created = await api.request('/api/patients', { method: 'POST', body: Object.assign({ id: id }, identityPayload()) });
                exists = true;
                reEnrolled = Boolean(created.patient && created.patient.reEnrolled);
            }
            // A student who was already in the system keeps their saved history and requirements: those are only
            // sent when the form was filled from the saved record and something in it was changed.
            const history = historyPayload();
            const requirements = requirementsPayload();
            const send = !reEnrolled ||
                (known !== null && JSON.stringify(history) !== known.history);
            const sendRequirements = !reEnrolled ||
                (known !== null && JSON.stringify(requirements) !== known.requirements);
            if (reEnrolled && known !== null && role === 'nurse') {
                await api.request('/api/patients/' + encodeURIComponent(id), { method: 'PUT', body: identityPayload() });
            }
            stage = 'history';
            if (send) await api.request('/api/patients/' + encodeURIComponent(id) + '/history', { method: 'PUT', body: history });
            stage = 'requirements';
            if (sendRequirements) await api.request('/api/patients/' + encodeURIComponent(id) + '/requirements', { method: 'PUT', body: requirements });
            window.location.assign('../nurse/record-detail.html?id=' + encodeURIComponent(id));
        } catch (error) {
            if (error.status === 401) return window.location.assign('/index.html');
            if (stage === 'student' && error.status === 409) {
                setError('sid', error.message || 'This student is already enrolled in the current school year.');
                message(error.message || 'This student is already enrolled in the current school year.', true);
                $('sid').focus();
            } else if (stage === 'history') {
                message('The student was saved, but the medical history was not: ' + error.message, true);
            } else if (stage === 'requirements') {
                message('The student was saved, but the laboratory requirements were not: ' + error.message, true);
            } else {
                message(error.message, true);
            }
            button.disabled = false;
            saving = false;
        }
    });
})();
