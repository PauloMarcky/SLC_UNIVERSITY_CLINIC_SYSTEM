/* Student Record page (Part 4 of the student record rebuild).
   SAMPLE DATA for now: nothing here is saved and nothing calls the API.
   Part 6 replaces SAMPLE_RECORDS with GET /api/patients/:id (shape follows the backend handoff).
   Part 5 (Add entry and Edit record) is at the bottom, also sample only. */
(function () {
    'use strict';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const IT = 'College of Information Technology', NUR = 'College of Nursing', EDU = 'College of Education';

    const SAMPLE_RECORDS = [
        {
            id: '2026-00123', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', college: IT,
            gender: 'Male', dateOfBirth: '2007-03-08', civilStatus: 'Single', nationality: 'Filipino',
            contactNumber: '0917 000 0000', address: 'Sample Street, Sample Barangay, Santiago City, Isabela',
            guardianName: 'Maria Dela Cruz', emergencyContact: '0918 000 0000',
            history: {
                asthma: true, asthmaLastAttack: '2026-03-14', asthmaMedicine: 'Salbutamol inhaler',
                allergy: true, allergyFood: 'shrimp', allergyMedicine: 'Cetirizine',
                febrileConvulsion: false, faintingSpell: false, epilepsy: false,
                vaccines: true, vaccineHepatitisB: true, vaccineOther: 'Tetanus', otherCondition: ''
            },
            vitals: [
                { entryDate: '2026-10-12', heightCm: 170, weightKg: 65, systolic: 118, diastolic: 76 },
                { entryDate: '2026-08-03', heightCm: 170, weightKg: 64, systolic: 120, diastolic: 78 },
                { entryDate: '2026-06-20', heightCm: 169, weightKg: 63, systolic: 116, diastolic: 74 },
                { entryDate: '2026-02-09', heightCm: 169, weightKg: 62, systolic: 114, diastolic: 72 }
            ],
            findings: [
                { entryDate: '2026-10-12', entryType: 'wellness', notes: 'Mild wheezing after PE class. Rested 20 minutes, inhaler used, symptoms cleared. Advised to bring inhaler to class.', examinedBy: 'Nurse (nurse1)' },
                { entryDate: '2026-08-03', entryType: 'consultation', notes: 'Headache and dizziness, referred by nurse. BP normal. Rest and fluids, sent back to class.', examinedBy: 'Dr. Sample Physician' },
                { entryDate: '2026-06-20', entryType: 'wellness', notes: 'Routine physical exam. No findings. Cleared for enrollment.', examinedBy: 'Nurse (nurse1)' },
                { entryDate: '2026-02-09', entryType: 'consultation', notes: 'Allergic rash after lunch (shrimp). Cetirizine given. Parents informed.', examinedBy: 'Dr. Sample Physician' }
            ]
        },
        {
            id: '2026-00145', lastName: 'Reyes', firstName: 'Ana', middleName: 'Lopez', college: NUR,
            gender: 'Female', dateOfBirth: '2008-05-20', civilStatus: 'Single', nationality: 'Filipino',
            contactNumber: '0917 111 1111', address: 'Sample Street, Sample Barangay, Cauayan City, Isabela',
            guardianName: 'Rosa Reyes', emergencyContact: '0918 111 1111',
            history: {
                asthma: false, asthmaLastAttack: null, asthmaMedicine: '',
                allergy: false, allergyFood: '', allergyMedicine: '',
                febrileConvulsion: true, faintingSpell: false, epilepsy: false,
                vaccines: true, vaccineHepatitisB: true, vaccineOther: '', otherCondition: 'Mild anemia'
            },
            vitals: [
                { entryDate: '2026-10-09', heightCm: 158, weightKg: 49, systolic: 110, diastolic: 70 },
                { entryDate: '2026-06-18', heightCm: 158, weightKg: 50, systolic: 108, diastolic: 68 }
            ],
            findings: [
                { entryDate: '2026-10-09', entryType: 'wellness', notes: 'Felt faint in the lab. Rested 15 minutes, given water. Advised to eat before class.', examinedBy: 'Nurse (nurse1)' }
            ]
        },
        {
            id: '2026-00167', lastName: 'Garcia', firstName: 'Mark', middleName: 'Villanueva', college: IT,
            gender: 'Male', dateOfBirth: '2006-02-11', civilStatus: 'Single', nationality: 'Filipino',
            contactNumber: '', address: '', guardianName: '', emergencyContact: '',
            history: {
                asthma: false, asthmaLastAttack: null, asthmaMedicine: '',
                allergy: false, allergyFood: '', allergyMedicine: '',
                febrileConvulsion: false, faintingSpell: false, epilepsy: false,
                vaccines: false, vaccineHepatitisB: false, vaccineOther: '', otherCondition: ''
            },
            vitals: [],
            findings: []
        },
        {
            id: '2026-00188', lastName: 'Santos', firstName: 'Carla', middleName: 'Mendoza', college: EDU,
            gender: 'Female', dateOfBirth: '2007-07-30', civilStatus: 'Single', nationality: 'Filipino',
            contactNumber: '0917 222 2222', address: 'Sample Street, Sample Barangay, Santiago City, Isabela',
            guardianName: 'Elena Santos', emergencyContact: '0918 222 2222',
            history: {
                asthma: false, asthmaLastAttack: null, asthmaMedicine: '',
                allergy: true, allergyFood: '', allergyMedicine: 'Loratadine',
                febrileConvulsion: false, faintingSpell: true, epilepsy: false,
                vaccines: false, vaccineHepatitisB: false, vaccineOther: '', otherCondition: ''
            },
            vitals: [
                { entryDate: '2026-09-21', heightCm: 155, weightKg: 52, systolic: 112, diastolic: 72 }
            ],
            findings: [
                { entryDate: '2026-09-21', entryType: 'consultation', notes: 'Dizzy spell during flag ceremony. BP normal. Rest and fluids, observed 30 minutes.', examinedBy: 'Dr. Sample Physician' }
            ]
        },
        {
            id: '2026-00201', lastName: 'Bautista', firstName: 'Paolo', middleName: 'Ramos', college: NUR,
            gender: 'Male', dateOfBirth: '2005-01-15', civilStatus: 'Single', nationality: 'Filipino',
            contactNumber: '0917 333 3333', address: 'Sample Street, Sample Barangay, Ilagan City, Isabela',
            guardianName: 'Ramon Bautista', emergencyContact: '0918 333 3333',
            history: {
                asthma: false, asthmaLastAttack: null, asthmaMedicine: '',
                allergy: false, allergyFood: '', allergyMedicine: '',
                febrileConvulsion: false, faintingSpell: false, epilepsy: false,
                vaccines: true, vaccineHepatitisB: false, vaccineOther: 'Tetanus, Influenza', otherCondition: ''
            },
            vitals: [
                { entryDate: '2026-08-30', heightCm: 175, weightKg: 70, systolic: 122, diastolic: 80 }
            ],
            findings: [
                { entryDate: '2026-08-30', entryType: 'wellness', notes: 'Routine check before clinical duty. No findings.', examinedBy: 'Nurse (nurse1)' }
            ]
        }
    ];

    const $ = function (id) { return document.getElementById(id); };
    const view = $('record-view');
    const message = $('record-message');
    if (!view || !message) return;

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    // "2026-10-12" -> "Oct 12, 2026" (no Date object, so no timezone shift)
    function formatDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1] : '';
    }

    function ageFrom(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return '';
        const now = new Date();
        const age = now.getFullYear() - Number(m[1]);
        const before = now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
        return before ? age - 1 : age;
    }

    function dash(value) {
        const text = String(value == null ? '' : value).trim();
        return text ? escapeHtml(text) : '<span class="empty-dash">&mdash;</span>';
    }

    function showMessage(text) {
        message.textContent = text;
        message.hidden = !text;
    }

    /* ---------- Identification ---------- */
    function field(label, valueHtml, extra) {
        return '<div class="id-item' + (extra ? ' ' + extra : '') + '"><span class="id-label">' + escapeHtml(label) + '</span><span class="id-value">' + valueHtml + '</span></div>';
    }

    function renderIdentification(r) {
        const age = ageFrom(r.dateOfBirth);
        $('r-ident').innerHTML =
            field('Identification no.', dash(r.id)) +
            field('Last name', dash(r.lastName)) +
            field('First name', dash(r.firstName)) +
            field('Middle name', dash(r.middleName)) +
            field('Department', dash(r.college)) +
            field('Gender', dash(r.gender)) +
            field('Age', age === '' ? dash('') : escapeHtml(age)) +
            field('Date of birth', dash(formatDate(r.dateOfBirth))) +
            field('Status', dash(r.civilStatus)) +
            field('Nationality', dash(r.nationality)) +
            field('Contact number', dash(r.contactNumber)) +
            '<div class="id-item id-gap" aria-hidden="true"></div>' +
            field('Address', dash(r.address), 'span-2') +
            field('Name of guardian', dash(r.guardianName)) +
            field('Contact no. in case of emergency', dash(r.emergencyContact));
    }

    /* ---------- Past medical history ---------- */
    function yes(kind) { return '<span class="yn yes-' + kind + '">&#10003; Yes</span>'; }
    function no() { return '<span class="yn no">No</span>'; }

    function historyRow(label, note, answerHtml, detail) {
        return '<tr><th scope="row">' + escapeHtml(label) + (note ? ' <small>(' + escapeHtml(note) + ')</small>' : '') + '</th>' +
            '<td class="hx-answer">' + answerHtml + '</td>' +
            '<td class="hx-detail">' + (detail ? escapeHtml(detail) : '<span class="empty-dash">&mdash;</span>') + '</td></tr>';
    }

    function renderHistory(r) {
        const h = r.history || {};
        const asthma = [];
        if (h.asthmaLastAttack) asthma.push('Last attack: ' + formatDate(h.asthmaLastAttack));
        if (h.asthmaMedicine) asthma.push('Medicine taken: ' + h.asthmaMedicine);
        const allergy = [];
        if (h.allergyFood) allergy.push('Food: ' + h.allergyFood);
        if (h.allergyMedicine) allergy.push('Medicine taken: ' + h.allergyMedicine);
        const vaccine = [];
        if (h.vaccineHepatitisB) vaccine.push('Hepatitis-B');
        if (h.vaccineOther) vaccine.push('Other: ' + h.vaccineOther);
        const other = String(h.otherCondition || '').trim();

        $('r-history').innerHTML =
            historyRow('Asthma', '', h.asthma ? yes('warn') : no(), h.asthma ? asthma.join(' \u00b7 ') : '') +
            historyRow('Allergy', '', h.allergy ? yes('warn') : no(), h.allergy ? allergy.join(' \u00b7 ') : '') +
            historyRow('Febrile convulsion', 'Mataas na lagnat', h.febrileConvulsion ? yes('warn') : no(), '') +
            historyRow('Fainting spell / Dizzy spell', 'Hinihimatay', h.faintingSpell ? yes('warn') : no(), '') +
            historyRow('Epilepsy', '', h.epilepsy ? yes('warn') : no(), '') +
            historyRow('Vaccines', 'Bakuna', h.vaccines ? yes('ok') : no(), h.vaccines ? vaccine.join(' \u00b7 ') : '') +
            '<tr><th scope="row">Other</th><td class="hx-answer">' + (other ? yes('warn') : '<span class="yn no">None</span>') + '</td>' +
            '<td class="hx-detail">' + (other ? escapeHtml(other) : '<span class="empty-dash">&mdash;</span>') + '</td></tr>';
    }

    /* ---------- Vitals and findings, newest first ---------- */
    function newestFirst(list) {
        return (list || []).slice().sort(function (a, b) { return a.entryDate < b.entryDate ? 1 : a.entryDate > b.entryDate ? -1 : 0; });
    }

    function emptyRow(cols, text) {
        return '<tr class="no-match"><td colspan="' + cols + '">' + escapeHtml(text) + '</td></tr>';
    }

    function renderVitals(r) {
        const rows = newestFirst(r.vitals);
        $('r-vitals').innerHTML = rows.length ? rows.map(function (v) {
            return '<tr><td>' + escapeHtml(formatDate(v.entryDate)) + '</td>' +
                '<td>' + escapeHtml(v.heightCm) + ' cm</td>' +
                '<td>' + escapeHtml(v.weightKg) + ' kg</td>' +
                '<td>' + escapeHtml(v.systolic) + ' / ' + escapeHtml(v.diastolic) + '</td></tr>';
        }).join('') : emptyRow(4, 'No vital signs recorded yet.');
    }

    const TYPES = {
        wellness: '<span class="type-wellness">Wellness</span>',
        consultation: '<span class="type-consult">Consultation</span>'
    };

    function renderFindings(r) {
        const rows = newestFirst(r.findings);
        $('r-findings').innerHTML = rows.length ? rows.map(function (f) {
            return '<tr><td>' + escapeHtml(formatDate(f.entryDate)) + '</td>' +
                '<td>' + (TYPES[f.entryType] || '<span class="empty-dash">&mdash;</span>') + '</td>' +
                '<td>' + escapeHtml(f.notes) + '</td>' +
                '<td>' + dash(f.examinedBy) + '</td></tr>';
        }).join('') : emptyRow(4, 'No findings or notes recorded yet.');
    }

    /* ---------- page ---------- */
    function fullName(r) {
        const first = [r.firstName, r.middleName].filter(Boolean).join(' ');
        return r.lastName + (first ? ', ' + first : '');
    }

    function render(r) {
        const name = fullName(r);
        document.title = name + ' - ULS Clinic System';
        $('r-name').textContent = name;
        const age = ageFrom(r.dateOfBirth);
        const bits = ['ID ' + r.id, r.college, r.gender, age === '' ? '' : age + ' years old'].filter(Boolean);
        $('r-line').textContent = bits.join(' \u00b7 ');
        renderIdentification(r);
        renderHistory(r);
        renderVitals(r);
        renderFindings(r);
        view.hidden = false;
    }

    /* ---------- Part 5: Add entry and Edit record (SAMPLE ONLY) ----------
       Both open one panel under the page header. Saving changes the sample record in memory so the
       tables update, but nothing is sent or stored: a reload brings the sample back.
       PART 6: replace the marked blocks with POST /api/patients/:id/entries and PUT /api/patients/:id. */
    let current = null;
    let sessionName = '';
    const DEPARTMENTS = ['College of Information Technology', 'College of Nursing', 'College of Education',
        'College of Business', 'College of Engineering', 'College of Law'];

    function todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const TODAY = todayIso();
    function isRealDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return false;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
    }

    const panel = document.createElement('section');
    panel.className = 'box entry-panel';
    panel.id = 'record-panel';
    panel.hidden = true;
    const headEl = view.querySelector('.record-head');
    if (headEl) headEl.insertAdjacentElement('afterend', panel); else view.insertBefore(panel, view.firstChild);

    let panelTrigger = null;
    const P = function (sel) { return panel.querySelector(sel); };
    const pv = function (sel) { return P(sel).value.trim(); };

    function fieldError(id, text) {
        const input = P('#' + id), box = P('#e-' + id);
        if (box) { box.textContent = text; box.hidden = !text; }
        if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    }
    function panelMessage(text) {
        const box = P('.panel-message');
        box.textContent = text;
        box.hidden = !text;
        if (text) box.focus();
    }
    function firstError(ids) {
        const el = P('#' + ids[0]);
        el.focus();
        el.scrollIntoView({ block: 'center' });
    }

    function closePanel(returnFocus) {
        panel.hidden = true;
        panel.innerHTML = '';
        if (returnFocus && panelTrigger) panelTrigger.focus();
    }

    function openPanel(trigger, title, hint, bodyHtml, saveLabel) {
        panelTrigger = trigger;
        showMessage('');
        panel.innerHTML =
            '<form class="visit-form" novalidate>' +
            '<div class="panel-head"><h3 id="panel-title" tabindex="-1">' + escapeHtml(title) + '</h3>' +
            '<button type="button" class="btn sec" data-close>Close</button></div>' +
            '<p class="sub-note">' + escapeHtml(hint) + '</p>' +
            '<p class="note save-result panel-message" role="alert" tabindex="-1" hidden></p>' +
            bodyHtml +
            '<div class="form-actions"><button class="btn" type="submit">' + escapeHtml(saveLabel) + '</button>' +
            '<button class="btn sec" type="button" data-close>Cancel</button>' +
            '<span class="form-actions-note">Sample only: nothing is saved yet.</span></div></form>';
        panel.hidden = false;
        panel.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closePanel(true); }); });
        panel.addEventListener('keydown', panelKeys);
        panel.scrollIntoView({ block: 'start' });
        return P('form');
    }
    function panelKeys(event) { if (event.key === 'Escape') closePanel(true); }

    function wireClear(ids) {
        ids.forEach(function (id) { const el = P('#' + id); if (el) el.addEventListener('input', function () { fieldError(id, ''); }); });
    }

    /* ---------- Add entry: one dated entry = vitals row and/or findings note ---------- */
    function openAddEntry(trigger) {
        const form = openPanel(trigger, 'Add entry',
            'One dated entry. Fill in the vital signs, the note, or both. Each save adds a new row; older rows stay.',
            '<section class="form-section"><div class="form cols-3">' +
            '<div class="f"><label for="ae-date">Date<span class="req" aria-hidden="true">*</span></label><input id="ae-date" type="date" max="' + TODAY + '" value="' + TODAY + '"><p class="field-error" id="e-ae-date" hidden></p></div>' +
            '<div class="f"><label for="ae-by">Examined by</label><input id="ae-by" maxlength="200" value="' + escapeHtml(sessionName || 'Nurse') + '"></div>' +
            '</div></section>' +
            '<section class="form-section"><h3>Vital Signs</h3><div class="form cols-3">' +
            '<div class="f"><label for="ae-height">Height (cm)</label><input id="ae-height" type="number" min="30" max="300" step="0.1" placeholder="170"><p class="field-error" id="e-ae-height" hidden></p></div>' +
            '<div class="f"><label for="ae-weight">Weight (kg)</label><input id="ae-weight" type="number" min="1" max="500" step="0.1" placeholder="65"><p class="field-error" id="e-ae-weight" hidden></p></div>' +
            '<div class="f"><label for="ae-sys">Blood pressure</label><div class="bp-pair"><input id="ae-sys" type="number" min="60" max="260" placeholder="120" aria-label="Systolic"><span aria-hidden="true">/</span><input id="ae-dia" type="number" min="30" max="160" placeholder="80" aria-label="Diastolic"></div><p class="field-error" id="e-ae-sys" hidden></p></div>' +
            '</div></section>' +
            '<section class="form-section"><h3>Physician\'s Findings / Nurse\'s Notes</h3><div class="form">' +
            '<div class="f full"><span class="label-text" id="ae-type-label">Type</span><div class="choice" role="radiogroup" aria-labelledby="ae-type-label">' +
            '<label><input type="radio" name="ae-type" value="wellness" checked> Wellness</label>' +
            '<label><input type="radio" name="ae-type" value="consultation"> Consultation</label></div>' +
            '<p class="field-hint">Wellness stays with the nurse. If the patient is not well, choose Consultation so the doctor sees it.</p></div>' +
            '<div class="f full"><label for="ae-notes">Findings / notes</label><textarea id="ae-notes" rows="4" maxlength="5000" placeholder="Write the finding or note"></textarea><p class="field-error" id="e-ae-notes" hidden></p></div>' +
            '</div></section>', 'Save entry');
        const ids = ['ae-date', 'ae-height', 'ae-weight', 'ae-sys', 'ae-notes'];
        wireClear(ids.concat(['ae-dia']));
        P('#ae-date').focus();

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            panelMessage('');
            ids.forEach(function (id) { fieldError(id, ''); });
            const errors = [];
            const fail = function (id, text) { fieldError(id, text); errors.push(id); };
            const date = P('#ae-date').value;
            if (!date) fail('ae-date', 'Enter the date.');
            else if (!isRealDate(date) || date > TODAY) fail('ae-date', 'The date cannot be in the future.');

            const h = pv('#ae-height'), w = pv('#ae-weight'), s = pv('#ae-sys'), d = pv('#ae-dia'), notes = pv('#ae-notes');
            const hasVitals = !!(h || w || s || d);
            if (hasVitals) {
                const hn = parseFloat(h), wn = parseFloat(w), sn = parseInt(s, 10), dn = parseInt(d, 10);
                if (!(hn >= 30 && hn <= 300)) fail('ae-height', 'Height must be 30 to 300 cm.');
                if (!(wn >= 1 && wn <= 500)) fail('ae-weight', 'Weight must be 1 to 500 kg.');
                if (!(sn >= 60 && sn <= 260) || !(dn >= 30 && dn <= 160)) fail('ae-sys', 'Systolic 60 to 260, diastolic 30 to 160.');
                else if (sn <= dn) fail('ae-sys', 'Systolic must be higher than diastolic.');
            }
            if (!errors.length && !hasVitals && !notes) {
                panelMessage('Fill in the vital signs, the note, or both.');
                return;
            }
            if (errors.length) { panelMessage('Please fix the highlighted fields.'); firstError(errors); return; }

            const typeInput = P('input[name="ae-type"]:checked');
            const payload = {
                entryDate: date,
                entryType: typeInput ? typeInput.value : 'wellness',
                vitals: hasVitals ? { heightCm: parseFloat(h), weightKg: parseFloat(w), systolic: parseInt(s, 10), diastolic: parseInt(d, 10) } : null,
                notes: notes,
                examinedBy: pv('#ae-by')
            };

            /* PART 6: replace this block with
               await fetch('/api/patients/' + encodeURIComponent(current.id) + '/entries', { method: 'POST', credentials: 'same-origin',
                   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
               then reload the record from the API. */
            console.log('Add entry (sample, not saved) for ' + current.id + ':', payload);
            if (payload.vitals) current.vitals.push({ entryDate: date, heightCm: payload.vitals.heightCm, weightKg: payload.vitals.weightKg, systolic: payload.vitals.systolic, diastolic: payload.vitals.diastolic });
            if (notes) current.findings.push({ entryDate: date, entryType: payload.entryType, notes: notes, examinedBy: payload.examinedBy });
            render(current);
            closePanel(false);
            showMessage('Entry added for ' + formatDate(date) + '. Sample only: it is not saved and goes away when the page is reloaded.');
            message.scrollIntoView({ block: 'center' });
        });
    }

    /* ---------- Edit record: identification and past medical history ---------- */
    function inp(id, label, value, extra) {
        return '<div class="f' + (extra && extra.cls ? ' ' + extra.cls : '') + '"><label for="' + id + '">' + escapeHtml(label) + (extra && extra.req ? '<span class="req" aria-hidden="true">*</span>' : '') + '</label>' +
            '<input id="' + id + '" value="' + escapeHtml(value) + '"' + (extra && extra.attrs ? ' ' + extra.attrs : '') + '>' +
            '<p class="field-error" id="e-' + id + '" hidden></p></div>';
    }
    function radios(name, label, options, selected) {
        return '<div class="f"><span class="label-text" id="' + name + '-label">' + escapeHtml(label) + '</span><div class="choice" role="radiogroup" aria-labelledby="' + name + '-label">' +
            options.map(function (o) { return '<label><input type="radio" name="' + name + '" value="' + o + '"' + (o === selected ? ' checked' : '') + '> ' + o + '</label>'; }).join('') + '</div></div>';
    }
    function hxRow(id, label, checked, extraHtml) {
        return '<div class="hx-row"><label class="hx-check"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> <span>' + label + '</span></label>' +
            (extraHtml ? '<div class="hx-extra" id="' + id + '-extra"' + (checked ? '' : ' hidden') + '>' + extraHtml + '</div>' : '<div></div>') + '</div>';
    }

    function openEditRecord(trigger) {
        const r = current, h = r.history || {};
        const depts = DEPARTMENTS.indexOf(r.college) === -1 && r.college ? DEPARTMENTS.concat([r.college]) : DEPARTMENTS;
        const deptSelect = '<div class="f"><label for="er-dept">Department</label><select id="er-dept"><option value="">Select department</option>' +
            depts.map(function (d) { return '<option' + (d === r.college ? ' selected' : '') + '>' + escapeHtml(d) + '</option>'; }).join('') + '</select></div>';
        const form = openPanel(trigger, 'Edit record',
            'Change the identification or the past medical history. Vital signs and findings are added with Add entry. The ID number cannot be changed here.',
            '<section class="form-section"><h3>Identification</h3><div class="form cols-3">' +
            inp('er-id', 'Identification no.', r.id, { cls: '', attrs: 'readonly class="auto"' }) +
            inp('er-last', 'Last name', r.lastName, { req: true, attrs: 'maxlength="100"' }) +
            inp('er-first', 'First name', r.firstName, { req: true, attrs: 'maxlength="100"' }) +
            inp('er-middle', 'Middle name', r.middleName, { attrs: 'maxlength="100"' }) +
            deptSelect +
            inp('er-contact', 'Contact number', r.contactNumber, { attrs: 'maxlength="30" inputmode="tel"' }) +
            radios('er-gender', 'Gender', ['Male', 'Female'], r.gender) +
            inp('er-dob', 'Date of birth', r.dateOfBirth || '', { attrs: 'type="date" max="' + TODAY + '"' }) +
            '<div class="f"><label for="er-age">Age (from date of birth)</label><input id="er-age" class="auto" readonly placeholder="Filled in automatically"></div>' +
            radios('er-status', 'Status', ['Single', 'Married', 'Other'], r.civilStatus) +
            inp('er-nation', 'Nationality', r.nationality, { attrs: 'maxlength="60"' }) +
            '<div></div>' +
            inp('er-address', 'Address', r.address, { cls: 'full', attrs: 'maxlength="300"' }) +
            inp('er-guardian', 'Name of guardian', r.guardianName, { attrs: 'maxlength="200"' }) +
            inp('er-emergency', 'Contact no. in case of emergency', r.emergencyContact, { attrs: 'maxlength="30" inputmode="tel"' }) +
            '</div></section>' +
            '<section class="form-section"><h3>Past Medical History</h3><p class="sub-note">Tick what applies. Extra boxes open only when ticked.</p>' +
            hxRow('er-asthma', 'Asthma', h.asthma,
                '<div><label for="er-asthma-date">Date of last attack</label><input id="er-asthma-date" type="date" max="' + TODAY + '" value="' + escapeHtml(h.asthmaLastAttack || '') + '"><p class="field-error" id="e-er-asthma-date" hidden></p></div>' +
                '<div><label for="er-asthma-med">Medicine taken</label><input id="er-asthma-med" maxlength="200" value="' + escapeHtml(h.asthmaMedicine) + '"></div>') +
            hxRow('er-allergy', 'Allergy', h.allergy,
                '<div><label for="er-allergy-food">Food, specify</label><input id="er-allergy-food" maxlength="200" value="' + escapeHtml(h.allergyFood) + '"></div>' +
                '<div><label for="er-allergy-med">Medicine taken</label><input id="er-allergy-med" maxlength="200" value="' + escapeHtml(h.allergyMedicine) + '"></div>') +
            hxRow('er-febrile', 'Febrile convulsion <small>(Mataas na lagnat)</small>', h.febrileConvulsion) +
            hxRow('er-fainting', 'Fainting spell / Dizzy spell <small>(Hinihimatay)</small>', h.faintingSpell) +
            hxRow('er-epilepsy', 'Epilepsy', h.epilepsy) +
            hxRow('er-vaccines', 'Vaccines <small>(Bakuna)</small>', h.vaccines,
                '<div class="hx-inline"><input type="checkbox" id="er-hepb"' + (h.vaccineHepatitisB ? ' checked' : '') + '><label for="er-hepb" style="margin:0">Hepatitis-B</label></div>' +
                '<div><label for="er-vaccine-other">Other vaccines</label><input id="er-vaccine-other" maxlength="200" value="' + escapeHtml(h.vaccineOther) + '"></div>') +
            hxRow('er-other', 'Other condition', !!String(h.otherCondition || '').trim(),
                '<div class="full"><label for="er-other-text">Specify</label><input id="er-other-text" maxlength="300" value="' + escapeHtml(h.otherCondition) + '"></div>') +
            '</section>', 'Save changes');

        ['er-asthma', 'er-allergy', 'er-vaccines', 'er-other'].forEach(function (id) {
            const box = P('#' + id), extra = P('#' + id + '-extra');
            box.addEventListener('change', function () { extra.hidden = !box.checked; });
        });
        function syncAge() {
            const v = P('#er-dob').value;
            const age = isRealDate(v) && v < TODAY ? ageFrom(v) : '';
            P('#er-age').value = age === '' ? '' : age + ' years old';
        }
        P('#er-dob').addEventListener('input', syncAge);
        syncAge();
        const ids = ['er-last', 'er-first', 'er-dob', 'er-asthma-date'];
        wireClear(ids);
        P('#er-last').focus();

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            panelMessage('');
            ids.forEach(function (id) { fieldError(id, ''); });
            const errors = [];
            const fail = function (id, text) { fieldError(id, text); errors.push(id); };
            if (!pv('#er-last')) fail('er-last', 'Enter the last name.');
            if (!pv('#er-first')) fail('er-first', 'Enter the first name.');
            const dob = P('#er-dob').value;
            if (dob && (!isRealDate(dob) || dob >= TODAY)) fail('er-dob', 'Date of birth must be a real date in the past.');
            if (P('#er-asthma').checked && P('#er-asthma-date').value && P('#er-asthma-date').value > TODAY) fail('er-asthma-date', 'The date cannot be in the future.');
            if (errors.length) { panelMessage('Please fix the highlighted fields.'); firstError(errors); return; }

            const radio = function (name) { const c = P('input[name="' + name + '"]:checked'); return c ? c.value : null; };
            const on = function (id) { return P('#' + id).checked; };
            const changes = {
                lastName: pv('#er-last'), firstName: pv('#er-first'), middleName: pv('#er-middle'),
                college: P('#er-dept').value, contactNumber: pv('#er-contact'),
                gender: radio('er-gender'), dateOfBirth: dob || null, civilStatus: radio('er-status'),
                nationality: pv('#er-nation'), address: pv('#er-address'),
                guardianName: pv('#er-guardian'), emergencyContact: pv('#er-emergency'),
                history: {
                    asthma: on('er-asthma'), asthmaLastAttack: on('er-asthma') ? (P('#er-asthma-date').value || null) : null,
                    asthmaMedicine: on('er-asthma') ? pv('#er-asthma-med') : '',
                    allergy: on('er-allergy'), allergyFood: on('er-allergy') ? pv('#er-allergy-food') : '',
                    allergyMedicine: on('er-allergy') ? pv('#er-allergy-med') : '',
                    febrileConvulsion: on('er-febrile'), faintingSpell: on('er-fainting'), epilepsy: on('er-epilepsy'),
                    vaccines: on('er-vaccines'), vaccineHepatitisB: on('er-vaccines') && on('er-hepb'),
                    vaccineOther: on('er-vaccines') ? pv('#er-vaccine-other') : '',
                    otherCondition: on('er-other') ? pv('#er-other-text') : ''
                }
            };

            /* PART 6: replace this block with
               await fetch('/api/patients/' + encodeURIComponent(current.id), { method: 'PUT', credentials: 'same-origin',
                   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
               then reload the record from the API. */
            console.log('Edit record (sample, not saved) for ' + current.id + ':', changes);
            Object.keys(changes).forEach(function (key) { current[key] = changes[key]; });
            render(current);
            closePanel(false);
            showMessage('Record updated. Sample only: it is not saved and goes back to the sample when the page is reloaded.');
            message.scrollIntoView({ block: 'center' });
        });
    }

    $('add-entry').addEventListener('click', function (e) { if (current) openAddEntry(e.currentTarget); });
    $('edit-record').addEventListener('click', function (e) { if (current) openEditRecord(e.currentTarget); });


    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
        showMessage('No student was selected. Go back to Medical Records and open a student.');
    } else {
        // PART 6: replace this lookup with GET /api/patients/:id
        const record = SAMPLE_RECORDS.filter(function (r) { return r.id === id; })[0];
        if (record) { current = record; render(record); }
        else showMessage('No student record found for ID ' + id + '. Go back to Medical Records and open a student from the list.');
    }

    // Doctors see this page read-only: show the tag and hide the two buttons. Nurses keep them.
    if (location.protocol !== 'file:') {
        fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (s) {
                if (s && s.user && s.user.username && s.user.role !== 'doctor') sessionName = 'Nurse (' + s.user.username + ')';
                if (s && s.user && s.user.role === 'doctor') {
                    $('readonly-tag').hidden = false;
                    $('r-actions').hidden = true;
                }
            })
            .catch(function () { /* leave the page as is */ });
    }
})();