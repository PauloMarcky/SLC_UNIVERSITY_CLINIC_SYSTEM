/* Doctor log pages (consultation, checkup, screening): load saved records, then search, filter and export them. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const body = document.getElementById('log-rows');
    if (!api || !body) return;
    const kind = body.dataset.log;
    const dash = '\u2014';
    const LONG = 60; // text longer than this is cut off and can be opened

    const num = (value, digits) => (value == null || value === '' || Number.isNaN(Number(value))) ? dash : Number(value).toFixed(digits);
    const text = value => (value == null || value === '') ? dash : String(value);
    const course = v => [v.course, v.yearLevel].filter(Boolean).join('-') || dash;
    const bmiGroup = bmi => {
        const n = Number(bmi);
        if (!Number.isFinite(n) || n <= 0) return '';
        if (n < 18.5) return 'Underweight';
        if (n < 25) return 'Normal';
        if (n < 30) return 'Overweight';
        return 'Obese';
    };

    // Each column: label for the Excel file, value shown on screen, and whether long text may be cut off.
    const SHEET = [
        ['Date', v => v.visitDate],
        ['Student', v => v.patientName],
        ['Sex', v => text(v.sex)],
        ['Age', v => text(v.age)],
        ['Course - Year Level', course],
        ['Height (m)', v => v.heightCm ? (v.heightCm / 100).toFixed(2) : dash],
        ['Weight (kg)', v => num(v.weightKg, 1)],
        ['BMI', v => num(v.bmi, 1)],
        ['Blood Pressure', v => text(v.bp)],
        ['Body Temp (\u00B0C)', v => num(v.bodyTemperature, 1)],
        ['No. of Visit', v => v.visitNumber || 1],
        ['Purpose', v => text(v.complaint), true],
        ['Pertinent P.E. & Laboratory Findings', v => text(v.soapObjective), true],
        ['Clinical Diagnosis', v => text(v.diagnosis), true],
        ['Action Taken', v => text(v.actionsTaken), true]
    ];
    const LOGS = {
        consultation: {
            url: '/api/visits',
            keep: v => v.visitType === 'Consultation',
            date: v => v.visitDate,
            cols: SHEET,
            empty: 'No consultations yet.'
        },
        checkup: {
            url: '/api/visits',
            keep: v => v.visitType === 'Checkup' && !v.screenedCopyOf,
            date: v => v.visitDate,
            cols: SHEET,
            empty: 'No checkups yet.'
        },
        screening: {
            url: '/api/visits/screened',
            keep: () => true,
            date: v => v.screenedAt || v.visitDate,
            cols: [
                ['Date', v => (v.screenedAt || v.visitDate || '').slice(0, 10)],
                ['Student', v => v.patientName],
                ['Course', v => text(v.course)],
                ['BMI', v => num(v.bmi, 1)],
                ['Blood Pressure', v => text(v.bp)],
                ['Body Temperature (\u00B0C)', v => num(v.bodyTemperature, 1)],
                ['Pertinent P.E. & Laboratory Findings', v => text(v.soapObjective || v.screenedNote), true],
                ['Action Taken', v => text(v.actionsTaken || v.screenedNote), true]
            ],
            empty: 'No screened records yet.'
        }
    };
    const log = LOGS[kind];
    if (!log) return;

    const el = id => document.getElementById(id);
    const ui = { search: el('log-search'), range: el('log-range'), hospital: el('log-hospital'),
        bmi: el('log-bmi'), clear: el('log-clear'), exportBtn: el('log-export'), count: el('log-count') };
    let records = [];

    function cell(value, long) {
        const td = document.createElement('td');
        const s = value == null ? '' : String(value);
        if (long && s.length > LONG) {
            const more = document.createElement('details');
            more.className = 'cell-more';
            const head = document.createElement('summary');
            head.textContent = s.slice(0, LONG).trim() + '\u2026';
            const full = document.createElement('div');
            full.className = 'cell-full';
            full.textContent = s;
            more.append(head, full);
            td.append(more);
        } else {
            td.textContent = s;
        }
        return td;
    }
    function message(textValue) {
        body.replaceChildren();
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.textContent = textValue;
        td.colSpan = log.cols.length;
        td.className = 'log-placeholder';
        tr.append(td);
        body.append(tr);
    }

    // Local date as YYYY-MM-DD so "Today" matches the clinic's clock, not UTC.
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    function rangeStart(choice) {
        const now = new Date();
        if (choice === 'today') return iso(now);
        if (choice === 'week') {
            const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
            return iso(monday);
        }
        if (choice === 'month') return iso(new Date(now.getFullYear(), now.getMonth(), 1));
        return '';
    }
    function visible() {
        const term = ui.search ? ui.search.value.trim().toLowerCase() : '';
        const from = ui.range ? rangeStart(ui.range.value) : '';
        const hospital = ui.hospital && ui.hospital.checked;
        const bmi = ui.bmi ? ui.bmi.value : '';
        return records.filter(v => {
            if (term && !(String(v.patientName || '').toLowerCase().includes(term) || String(v.patientId || '').toLowerCase().includes(term))) return false;
            if (from && String(log.date(v) || '').slice(0, 10) < from) return false;
            if (hospital && !v.sentToHospital) return false;
            if (bmi && bmiGroup(v.bmi) !== bmi) return false;
            return true;
        });
    }
    function render() {
        const rows = visible();
        if (ui.count) ui.count.textContent = records.length ? 'Showing ' + rows.length + ' of ' + records.length : '';
        if (!records.length) return message(log.empty);
        if (!rows.length) return message('No records match your search or filters.');
        body.replaceChildren();
        rows.forEach(v => {
            const tr = document.createElement('tr');
            log.cols.forEach(col => tr.append(cell(col[1](v), col[2])));
            body.append(tr);
        });
    }
    function clearFilters() {
        if (ui.search) ui.search.value = '';
        if (ui.range) ui.range.value = 'all';
        if (ui.hospital) ui.hospital.checked = false;
        if (ui.bmi) ui.bmi.value = '';
        render();
    }
    function exportExcel() {
        const rows = visible();
        if (!rows.length) { window.alert('There are no records to export.'); return; }
        if (!window.XLSX) { window.alert('The Excel export could not start. Reload the page and try again.'); return; }
        const data = [log.cols.map(c => c[0])].concat(rows.map(v => log.cols.map(c => {
            const value = c[1](v);
            return value === dash ? '' : value;
        })));
        const sheet = window.XLSX.utils.aoa_to_sheet(data);
        sheet['!cols'] = log.cols.map(c => ({ wch: c[2] ? 40 : Math.max(10, c[0].length + 2) }));
        const book = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(book, sheet, kind.charAt(0).toUpperCase() + kind.slice(1));
        window.XLSX.writeFile(book, kind + '-' + iso(new Date()) + '.xlsx');
    }

    async function load() {
        try {
            const result = await api.request(log.url);
            records = result.visits.filter(log.keep);
            render();
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message);
        }
    }
    if (ui.search) ui.search.addEventListener('input', render);
    [ui.range, ui.hospital, ui.bmi].forEach(control => { if (control) control.addEventListener('change', render); });
    if (ui.clear) ui.clear.addEventListener('click', clearFilters);
    if (ui.exportBtn) ui.exportBtn.addEventListener('click', exportExcel);
    load();
})();
