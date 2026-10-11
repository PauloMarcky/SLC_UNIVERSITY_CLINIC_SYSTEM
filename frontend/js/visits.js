/* Consultations and Checkups page: loads visits from /api/visits.
   Search (patient name or ID) and the college filter are done by the server. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const COLUMNS = 7;
    let timer, latest = 0;

    function cell(text, className) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        if (className) td.className = className;
        return td;
    }
    // Colour class plus a text cue, so the status is not shown by colour alone.
    function level(status) {
        if (status === 'Normal') return { css: 'c-good', mark: '\u25CF' };
        return /Stage 2|Obese/.test(status)
            ? { css: 'c-bad', mark: '\u25A0' }
            : { css: 'c-warn', mark: '\u25B2' };
    }
    function statusCell(value, status) {
        const lv = level(status);
        const td = cell(value, lv.css);
        const cue = document.createElement('span');
        cue.className = 'cue';
        cue.textContent = lv.mark + ' ' + status;
        td.append(cue);
        return td;
    }
    function dateCell(iso) {
        const td = document.createElement('td');
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        const time = document.createElement('time');
        time.dateTime = iso || '';
        time.textContent = m
            ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
                .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
            : (iso || '');
        td.append(time);
        return td;
    }
    function pill(text) {
        const span = document.createElement('span');
        span.className = 'pill purple';
        span.textContent = text;
        return span;
    }
    function row(v) {
        const tr = document.createElement('tr');
        const patient = cell(v.patientName);
        if (v.confidential) patient.append(pill('Confidential'));
        const diagnosis = document.createElement('td');
        if (v.confidential) diagnosis.append(pill(v.diagnosis));
        else diagnosis.textContent = v.diagnosis;
        tr.append(dateCell(v.visitDate), patient, cell(v.college), cell(v.complaint), diagnosis,
            statusCell(v.bp, v.bpStatus), statusCell(v.bmi, v.bmiStatus));
        return tr;
    }
    function fill(tbody, visits, emptyText) {
        tbody.replaceChildren();
        if (!visits.length) {
            const tr = document.createElement('tr');
            const td = cell(emptyText);
            td.colSpan = COLUMNS;
            tr.append(td);
            tbody.append(tr);
            return;
        }
        visits.forEach(v => tbody.append(row(v)));
    }
    function message(text) {
        $('visits-message').textContent = text;
        $('visits-message').hidden = !text;
    }

    async function load() {
        const mine = ++latest;            // ignore a slow answer that arrives after a newer one
        const params = new URLSearchParams();
        const search = $('visit-search').value.trim();
        const college = $('visit-college').value;
        if (search) params.set('search', search);
        if (college) params.set('college', college);
        const filtered = Boolean(search || college);
        try {
            const result = await api.request('/api/visits?' + params.toString());
            if (mine !== latest) return;
            const visits = result.visits;
            fill($('consult-rows'), visits.filter(v => v.visitType === 'Consultation'),
                filtered ? 'No consultations match your search.' : 'No consultations yet. Click + New Visit to add one.');
            fill($('checkup-rows'), visits.filter(v => v.visitType === 'Checkup'),
                filtered ? 'No checkups match your search.' : 'No checkups yet. Click + New Visit to add one.');
            $('visit-count').textContent = visits.length + (visits.length === 1 ? ' record' : ' records') + (filtered ? ' found' : '');
            message('');
        } catch (error) {
            if (mine !== latest) return;
            console.error('visits load failed:', error);
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message);
        }
    }

    $('visit-search').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(load, 250); });
    $('visit-college').addEventListener('change', load);
    $('visit-clear').addEventListener('click', function () {
        $('visit-search').value = '';
        $('visit-college').value = '';
        load();
        $('visit-search').focus();
    });

    // After "Save visit" the form sends the doctor here with ?saved=1.
    if (new URLSearchParams(location.search).get('saved') === '1') {
        $('saved-banner').hidden = false;
        history.replaceState(null, '', location.pathname);
    }
    load();
})();
