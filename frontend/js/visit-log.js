/* Doctor log pages (consultation, checkup, screening): the server searches, filters and pages the records; this file shows one page at a time and exports every match. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const body = document.getElementById('log-rows');
    if (!api || !body) return;
    const kind = body.dataset.log;
    const dash = '\u2014';
    const LONG = 60; // text longer than this is cut off and can be opened
    const PAGE_SIZE = 50;       // rows per page
    const EXPORT_LIMIT = 2000;  // most rows one Excel file takes (the server's own cap)
    

    const num = (value, digits) => (value == null || value === '' || Number.isNaN(Number(value))) ? dash : Number(value).toFixed(digits);
    const text = value => (value == null || value === '') ? dash : String(value);
    const course = v => [v.course, v.yearLevel].filter(Boolean).join('-') || dash;

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
            fixed: { type: 'Consultation' },
            date: v => v.visitDate,
            cols: SHEET,
            empty: 'No consultations yet.'
        },
        checkup: {
            url: '/api/visits',
            fixed: { type: 'Checkup', excludeScreenedCopies: '1' },
            date: v => v.visitDate,
            cols: SHEET,
            empty: 'No checkups yet.'
        },
        screening: {
            url: '/api/visits/screened',
            fixed: {},
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
    let records = [];   // the rows of the page on screen
    let total = 0;      // every row that matches the filters, on all pages
    let page = 1;
    let requestId = 0;  // lets a slow old answer be ignored when a newer one was asked for

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

    // The filters on screen, as the options the server understands.
    function filters() {
        const f = Object.assign({}, log.fixed);
        const term = ui.search ? ui.search.value.trim() : '';
        const from = ui.range ? rangeStart(ui.range.value) : '';
        if (term) f.search = term;
        if (from) f.from = from;
        if (ui.hospital && ui.hospital.checked) f.sentToHospital = '1';
        if (ui.bmi && ui.bmi.value) f.bmi = ui.bmi.value;
        return f;
    }
    const isFiltered = () => Object.keys(filters()).some(key => !(key in log.fixed));
    const url = (f, pageNumber, pageSize) => log.url + '?' + new URLSearchParams(Object.assign({}, f, { page: pageNumber, pageSize })).toString();
    const pages = () => Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Previous / Next buttons sit under the "Showing ..." line. Built here so the HTML pages do not change.
    const pager = document.createElement('div');
    pager.className = 'log-pager';
    pager.hidden = true;
    const prevBtn = document.createElement('button');
    const nextBtn = document.createElement('button');
    const pageLabel = document.createElement('span');
    [prevBtn, nextBtn].forEach(b => { b.type = 'button'; b.className = 'btn sec'; });
    prevBtn.textContent = '\u2039 Previous';
    nextBtn.textContent = 'Next \u203A';
    pageLabel.className = 'log-page-label';
    pager.append(prevBtn, pageLabel, nextBtn);
    if (ui.count) ui.count.after(pager);

    function render() {
        if (!total) {
            if (ui.count) ui.count.textContent = '';
            pager.hidden = true;
            return message(isFiltered() ? 'No records match your search or filters.' : log.empty);
        }
        const first = (page - 1) * PAGE_SIZE + 1;
        const last = first + records.length - 1;
        if (ui.count) ui.count.textContent = 'Showing ' + first + ' to ' + last + ' of ' + total;
        pager.hidden = total <= PAGE_SIZE;
        pageLabel.textContent = 'Page ' + page + ' of ' + pages();
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= pages();
        body.replaceChildren();
        records.forEach(v => {
            const tr = document.createElement('tr');
            log.cols.forEach(col => tr.append(cell(col[1](v), col[2])));
            body.append(tr);
        });
    }

    async function load(wanted) {
        const mine = ++requestId;
        try {
            const result = await api.request(url(filters(), wanted, PAGE_SIZE));
            if (mine !== requestId) return;   // a newer search was started meanwhile
            total = Number(result.total) || 0;
            // If the data shrank and this page no longer exists, go to the last one.
            if (total && wanted > pages()) return load(pages());
            page = wanted;
            records = result.visits;
            render();
        } catch (error) {
            if (mine !== requestId) return;
            if (error.status === 401) window.location.assign('/index.html');
            else { pager.hidden = true; message(error.message); }
        }
    }

    function clearFilters() {
        if (ui.search) ui.search.value = '';
        if (ui.range) ui.range.value = 'all';
        if (ui.hospital) ui.hospital.checked = false;
        if (ui.bmi) ui.bmi.value = '';
        load(1);
    }

    // Exports every match (up to the limit), not only the page on screen.
    async function exportExcel() {
        if (!total) { window.alert('There are no records to export.'); return; }
        if (!window.XLSX) { window.alert('The Excel export could not start. Reload the page and try again.'); return; }
        if (ui.exportBtn) ui.exportBtn.disabled = true;
        try {
            const result = await api.request(url(filters(), 1, EXPORT_LIMIT));
            const rows = result.visits;
            const data = [log.cols.map(c => c[0])].concat(rows.map(v => log.cols.map(c => {
                const value = c[1](v);
                return value === dash ? '' : value;
            })));
            const sheet = window.XLSX.utils.aoa_to_sheet(data);
            sheet['!cols'] = log.cols.map(c => ({ wch: c[2] ? 40 : Math.max(10, c[0].length + 2) }));
            const book = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(book, sheet, kind.charAt(0).toUpperCase() + kind.slice(1));
            window.XLSX.writeFile(book, kind + '-' + iso(new Date()) + '.xlsx');
            if (Number(result.total) > rows.length) {
                window.alert('Only the newest ' + rows.length + ' of ' + result.total + ' records were exported. Use the filters to export the rest.');
            }
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else window.alert(error.message || 'The export failed. Try again.');
        } finally {
            if (ui.exportBtn) ui.exportBtn.disabled = false;
        }
    }

    // Typing waits a moment so the server is asked once, not on every key.
    let typing = 0;
    if (ui.search) ui.search.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => load(1), 300); });
    [ui.range, ui.hospital, ui.bmi].forEach(control => { if (control) control.addEventListener('change', () => load(1)); });
    if (ui.clear) ui.clear.addEventListener('click', clearFilters);
    if (ui.exportBtn) ui.exportBtn.addEventListener('click', exportExcel);
    prevBtn.addEventListener('click', () => load(page - 1));
    nextBtn.addEventListener('click', () => load(page + 1));
    load(1);
})();
