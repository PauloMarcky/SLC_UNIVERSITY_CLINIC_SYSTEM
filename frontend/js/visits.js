(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    let timer;

    function cell(text, className) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        if (className) td.className = className;
        return td;
    }
    function statusClass(status) {
        if (status === 'Normal') return 'c-good';
        return /Stage 2|Obese/.test(status) ? 'c-bad' : 'c-warn';
    }
    function row(v) {
        const tr = document.createElement('tr');
        const type = document.createElement('td');
        if (v.confidential) {
            const pill = document.createElement('span');
            pill.className = 'pill purple';
            pill.textContent = 'Confidential';
            type.append(pill);
        } else type.textContent = v.visitType === 'Checkup' ? 'Checkup' : 'Consult';
        const bp = cell(v.bp, statusClass(v.bpStatus)); bp.title = v.bpStatus;
        const bmi = cell(v.bmi, statusClass(v.bmiStatus)); bmi.title = v.bmiStatus;
        tr.append(cell(v.visitDate), cell(v.patientName), cell(v.college), type,
            cell(v.complaint), cell(v.diagnosis, v.confidential ? 'c-conf' : ''), bp, bmi);
        return tr;
    }
    function fill(tbody, visits, emptyText) {
        tbody.replaceChildren();
        if (!visits.length) {
            const tr = document.createElement('tr');
            const td = cell(emptyText); td.colSpan = 8;
            tr.append(td); tbody.append(tr);
            return;
        }
        visits.forEach(v => tbody.append(row(v)));
    }
    function message(text) {
        $('visits-message').textContent = text;
        $('visits-message').hidden = !text;
    }
    async function load() {
        const params = new URLSearchParams();
        const search = $('visit-search').value.trim();
        const college = $('visit-college').value;
        if (search) params.set('search', search);
        if (college) params.set('college', college);
        try {
            const { visits } = await api.request('/api/visits?' + params.toString());
            console.log('visits loaded:', visits.length);
            fill($('consult-rows'), visits.filter(v => v.visitType === 'Consultation'),
                'No consultations yet. Click + New Visit to add one.');
            fill($('checkup-rows'), visits.filter(v => v.visitType === 'Checkup'),
                'No checkups yet. Click + New Visit to add one.');
            message('');
        } catch (error) {
            console.error('visits load failed:', error);
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message);
        }
    }
    $('visit-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    $('visit-college').addEventListener('change', load);
    load();
})();