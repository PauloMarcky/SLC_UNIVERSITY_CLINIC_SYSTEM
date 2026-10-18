/* Doctor log pages (consultation, checkup, screening): load saved records as soon as the page opens. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const body = document.getElementById('log-rows');
    if (!api || !body) return;
    const kind = body.dataset.log;
    const dash = '\u2014';

    const LOGS = {
        consultation: {
            url: '/api/visits',
            keep: v => v.visitType === 'Consultation',
            cols: v => [v.visitDate, v.patientName, [v.course, window.SLCDepartments ? window.SLCDepartments.short(v.college) : v.college].filter(Boolean).join(' / ') || dash,
                v.complaint, v.diagnosis, v.actionsTaken || dash],
            empty: 'No consultations yet.',
            emptyYear: 'No consultations in this school year yet.'
        },
        checkup: {
            url: '/api/visits',
            keep: v => v.visitType === 'Checkup' && !v.screenedCopyOf,
            cols: v => [v.visitDate, v.patientName, v.heightCm + ' cm', v.weightKg + ' kg',
                v.bmi, v.age == null ? dash : v.age, v.course || dash, v.diagnosis],
            empty: 'No checkups yet.',
            emptyYear: 'No checkups in this school year yet.'
        },
        screening: {
            url: '/api/visits/screened',
            keep: () => true,
            cols: v => [(v.screenedAt || v.visitDate || '').slice(0, 10), v.patientName, v.course || dash,
                v.bmi, v.bp, dash, v.soapObjective || v.screenedNote || dash,
                v.actionsTaken || v.screenedNote || dash],
            empty: 'No screened records yet.',
            emptyYear: 'No screened records in this school year yet.'
        }
    };
    const sheet = v => [v.visitDate, v.patientName, v.sex || dash, v.age == null ? dash : v.age,
        [v.course, v.yearLevel].filter(Boolean).join('-') || dash,
        (v.heightCm / 100).toFixed(2), v.weightKg, v.bmi, v.bp,
        v.bodyTemperature == null ? dash : v.bodyTemperature, v.visitNumber || 1,
        v.complaint, v.soapObjective || dash, v.diagnosis, v.actionsTaken || dash];
    const log = LOGS[kind];
    if (log && (kind === 'consultation' || kind === 'checkup')) log.cols = sheet;
    if (!log) return;

    function cell(text) {
        const td = document.createElement('td');
        const s = text == null ? '' : String(text);
        if (s.length > 32) {
            const more = document.createElement('details');
            more.className = 'cell-more';
            const head = document.createElement('summary');
            head.textContent = s.slice(0, 32).trim() + '\u2026';
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
    function message(text) {
        body.replaceChildren();
        const tr = document.createElement('tr');
        const td = cell(text);
        td.colSpan = log.cols({}).length;
        td.className = 'log-placeholder';
        tr.append(td);
        body.append(tr);
    }
    // School year picker (school-year.js). Records restart every school year; older years stay on file.
    const yearSelect = document.getElementById('log-year');
    let year = null;
    async function load() {
        try {
            const chosen = year ? year.value() : '';
            const result = await api.request(log.url + (chosen ? '?schoolYear=' + encodeURIComponent(chosen) : ''));
            const visits = result.visits.filter(log.keep);
            if (!visits.length) return message(chosen ? log.emptyYear : log.empty);
            body.replaceChildren();
            visits.forEach(v => {
                const tr = document.createElement('tr');
                log.cols(v).forEach(value => tr.append(cell(value)));
                body.append(tr);
            });
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else message(error.message);
        }
    }
    if (yearSelect && window.SchoolYear) {
        window.SchoolYear.mount(yearSelect, { onChange: load }).then(function (picker) { year = picker; load(); });
    } else {
        load();
    }
})();