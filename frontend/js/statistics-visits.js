/* Statistics for Checkup and Statistics for Consultation.
   Both pages load this one script; <main data-stat-type="Checkup"|"Consultation"> says which page it is.
   Real numbers from GET /api/statistics (doctor only). The Period uses the device clock. */
(function () {
    'use strict';

    const api = window.ClinicAPI;
    const main = document.querySelector('main[data-stat-type]');
    if (!api || !main) return;

    const TYPE = main.dataset.statType;
    const IS_CHECKUP = TYPE === 'Checkup';
    const NOUN = IS_CHECKUP ? { one: 'checkup', many: 'checkups' } : { one: 'consultation', many: 'consultations' };
    const PERIOD_LABEL = { month: 'This month', last: 'Last month', year: 'This year', all: 'All time' };
    const BMI_CLASS = { Underweight: 'fill-under', Normal: 'fill-normal', Overweight: 'fill-over', Obese: 'fill-obese' };

    const $ = id => document.getElementById(id);
    const period = $('stat-period');
    const college = $('stat-college');
    const reset = $('stat-reset');
    const summary = $('stat-summary');
    const errorBox = $('stat-error');

    // ---------- Period -> dates (local date, not UTC, so the Philippines day does not shift) ----------
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function rangeOf(key) {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        if (key === 'month') return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
        if (key === 'last') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
        if (key === 'year') return { from: y + '-01-01', to: y + '-12-31' };
        return {};
    }

    // ---------- Drawing ----------
    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function sum(list) { return list.reduce((a, row) => a + row.count, 0); }

    function headRow(first, second) {
        const row = el('div', 'stat-row head no-trend');
        row.setAttribute('aria-hidden', 'true');
        row.appendChild(el('span', 'stat-label', first));
        row.appendChild(el('span', 'stat-track-head', ''));
        row.appendChild(el('span', 'stat-value', second));
        return row;
    }

    function dataRow(item, max, total, options) {
        const row = el('div', 'stat-row no-trend' + (options.selected ? ' is-selected' : ''));
        row.setAttribute('role', 'listitem');
        const label = el('span', 'stat-label', item.label);
        if (options.selected) label.appendChild(el('span', 'pill neutral', 'Selected'));
        row.appendChild(label);
        const track = el('span', 'stat-track');
        track.setAttribute('aria-hidden', 'true');
        const fill = el('i', 'stat-fill' + (options.fillClass ? ' ' + options.fillClass : ''));
        fill.style.width = (max ? Math.round(item.count / max * 100) : 0) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        const value = el('span', 'stat-value', String(item.count));
        value.appendChild(el('small', '', '(' + (total ? Math.round(item.count / total * 100) : 0) + '%)'));
        row.appendChild(value);
        return row;
    }

    // percentOf: the number the percentages are taken from.
    function drawList(side, list, headA, headB, unit, percentOf, options) {
        const container = $('stat-' + side);
        const totalNode = $('stat-' + side + '-total');
        const total = sum(list);
        const o = options || {};
        container.textContent = '';
        totalNode.textContent = total + ' ' + (total === 1 ? unit.one : unit.many);
        if (!total) {
            container.appendChild(el('p', 'stat-empty', 'No ' + unit.many + ' for this selection.'));
            return;
        }
        container.appendChild(headRow(headA, headB));
        const max = list.reduce((m, row) => Math.max(m, row.count), 0);
        list.forEach(item => container.appendChild(dataRow(item, max, percentOf || total, {
            selected: o.selectedLabel && item.label === o.selectedLabel,
            fillClass: o.fillClassOf ? o.fillClassOf(item) : ''
        })));
    }

    function setMetric(name, value, extra) {
        const node = document.querySelector('[data-metric="' + name + '"]');
        if (!node) return;
        node.textContent = value;
        node.classList.toggle('is-text', !!(extra && extra.text));
    }

    function setMetricNote(name, value) {
        const node = document.querySelector('[data-metric-note="' + name + '"]');
        if (node) node.textContent = value;
    }

    function fillColleges(list, chosen) {
        const wanted = JSON.stringify(list);
        if (college.dataset.filled !== wanted) {
            college.textContent = '';
            const all = el('option', '', 'All departments');
            all.value = '';
            college.appendChild(all);
            list.forEach(name => {
                const option = el('option', '', name);
                option.value = name;
                college.appendChild(option);
            });
            college.dataset.filled = wanted;
        }
        college.value = list.includes(chosen) ? chosen : '';
    }

    function showError(textValue) {
        errorBox.textContent = textValue;
        errorBox.hidden = false;
    }

    function clearScreen() {
        ['left', 'right'].forEach(side => {
            $('stat-' + side).textContent = '';
            $('stat-' + side + '-total').textContent = '';
        });
        document.querySelectorAll('[data-metric]').forEach(node => { node.textContent = '\u2014'; node.classList.remove('is-text'); });
        document.querySelectorAll('[data-metric-note]').forEach(node => { node.textContent = ''; });
        summary.textContent = '';
    }

    function render(data) {
        fillColleges(data.colleges, data.college);
        const total = data.total;
        setMetric('total', String(total));
        setMetric('hospital', String(data.sentToHospital));

        if (IS_CHECKUP) {
            setMetric('average', data.averageBmi === null ? '\u2014' : data.averageBmi.toFixed(1));
            drawList('left', data.byCollege, 'Department', 'Checkups', NOUN, 0, { selectedLabel: data.college });
            drawList('right', data.bmi, 'Category', 'Records', { one: 'record', many: 'records' }, total,
                { fillClassOf: item => BMI_CLASS[item.label] });
        } else {
            const top = data.topDiagnoses[0];
            setMetric('top', top ? top.label : '\u2014', { text: !!top });
            setMetricNote('top', top ? top.count + (top.count === 1 ? ' case' : ' cases') : 'Most frequent diagnosis');
            drawList('left', data.topDiagnoses, 'Diagnosis', 'Cases', { one: 'case', many: 'cases' }, total);
            drawList('right', data.byCollege, 'Department', 'Consultations', NOUN, 0, { selectedLabel: data.college });
            const shown = data.topDiagnoses.length;
            $('stat-left-foot').textContent = 'Diagnosis is typed in by the doctor, so different spellings are counted separately.' +
                (data.distinctDiagnoses > shown ? ' Showing the ' + shown + ' most common of ' + data.distinctDiagnoses + ' different wordings.' : '');
        }

        summary.textContent = 'Showing ' + total + ' ' + (total === 1 ? NOUN.one : NOUN.many) + ' \u00B7 ' +
            (data.college || 'All departments') + ' \u00B7 ' + PERIOD_LABEL[period.value];
    }

    // ---------- Loading ----------
    let ticket = 0;
    async function load() {
        const mine = ++ticket;
        const range = rangeOf(period.value);
        const params = new URLSearchParams({ type: TYPE });
        if (range.from) params.set('from', range.from);
        if (range.to) params.set('to', range.to);
        if (college.value) params.set('college', college.value);
        summary.textContent = 'Loading\u2026';
        try {
            const data = await api.request('/api/statistics?' + params.toString());
            if (mine !== ticket) return;          // a newer choice was made while this one was loading
            errorBox.hidden = true;
            render(data);
        } catch (error) {
            if (mine !== ticket) return;
            if (error.status === 401) { window.location.assign('/index.html'); return; }
            clearScreen();
            showError(error.message);
        }
    }

    period.addEventListener('change', load);
    college.addEventListener('change', load);
    reset.addEventListener('click', () => {
        period.value = 'month';
        college.value = '';
        load();
    });
    load();
})();
