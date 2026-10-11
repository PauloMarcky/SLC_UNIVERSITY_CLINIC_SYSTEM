/* Statistics page (frontend only, sample data).
   One small sample dataset feeds every panel, so the totals always agree with each other and with the filters.
   This is NOT real clinic data. Real figures and real alerts need a statistics API from the backend. */
(function () {
    'use strict';

    var period = document.getElementById('stat-period');
    var college = document.getElementById('stat-college');
    var group = document.getElementById('stat-group');
    var reset = document.getElementById('stat-reset');
    if (!period || !college || !group) return;

    // ---------- Sample data ----------
    var COLLEGES = ['Engineering', 'Business', 'IT', 'Nursing'];
    var COLLEGE_SHARE = { Engineering: 0.36, Business: 0.28, IT: 0.21, Nursing: 0.15 };
    // How big each group is compared with students (sample numbers only).
    var GROUP_FACTOR = { Students: 1, Deans: 0.08, 'Full-Time Faculty': 0.25, 'Part-Time/City Faculty': 0.15, Maintenance: 0.12 };
    // Cases per time slot: [earlier, 3 weeks ago, 2 weeks ago, last week, this week]
    var CONDITIONS = [
        { name: 'URI / Flu', weeks: [60, 6, 8, 11, 20] },
        { name: 'Wounds', weeks: [40, 4, 5, 4, 5] },
        { name: 'Viral conjunctivitis', weeks: [20, 2, 2, 3, 6] },
        { name: 'Mental health (aggregate)', weeks: [25, 2, 2, 2, 3] },
        { name: 'Metabolic', weeks: [15, 2, 1, 2, 2] },
        { name: 'Neurological', weeks: [12, 1, 1, 1, 2] }
    ];
    var LAST_WEEK = 3, THIS_WEEK = 4;
    var PERIOD_SLOTS = { all: [0, 1, 2, 3, 4], month: [1, 2, 3, 4], week: [4] };
    var PERIOD_LABEL = { all: 'All time', month: 'This month', week: 'This week' };

    // BMI checkups (sample). Category names only; cut-offs must be confirmed by the clinic doctor.
    var BMI = [
        { name: 'Underweight', cls: 'fill-under', base: 34 },
        { name: 'Normal', cls: 'fill-normal', base: 260 },
        { name: 'Overweight', cls: 'fill-over', base: 110 },
        { name: 'Obese', cls: 'fill-obese', base: 46 }
    ];
    var BMI_PERIOD = { all: 1, month: 0.35, week: 0.08 };

    // Sample rule for the outbreak check (the real rule is for the doctor to decide):
    var ALERT_MIN_THIS_WEEK = 5;   // at least this many cases this week
    var ALERT_RATIO = 1.5;         // and at least 1.5x last week

    // Split a whole number across the colleges so the parts always add up exactly (largest remainder).
    function split(total) {
        var raw = COLLEGES.map(function (c) { return total * COLLEGE_SHARE[c]; });
        var out = raw.map(Math.floor);
        var left = total - out.reduce(function (a, b) { return a + b; }, 0);
        raw.map(function (r, i) { return [r - Math.floor(r), i]; })
            .sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })
            .slice(0, left)
            .forEach(function (p) { out[p[1]] += 1; });
        return out;
    }

    // ---------- Calculations ----------
    function pick(cells, collegeName) {
        // cells = counts per college; sum them all, or take one college.
        if (!collegeName) return cells.reduce(function (a, b) { return a + b; }, 0);
        return cells[COLLEGES.indexOf(collegeName)];
    }

    function conditionCells(cond, slot, factor) {
        return split(Math.round(cond.weeks[slot] * factor));
    }

    function compute(state) {
        var factor = GROUP_FACTOR[state.group];
        var slots = PERIOD_SLOTS[state.period];

        var conditions = CONDITIONS.map(function (cond) {
            var total = 0;
            slots.forEach(function (s) { total += pick(conditionCells(cond, s, factor), state.college); });
            var last = pick(conditionCells(cond, LAST_WEEK, factor), state.college);
            var now = pick(conditionCells(cond, THIS_WEEK, factor), state.college);
            var rising = now >= ALERT_MIN_THIS_WEEK && now >= last * ALERT_RATIO;
            return { name: cond.name, total: total, last: last, now: now, rising: rising };
        }).sort(function (a, b) { return b.total - a.total; });

        // The college panel always lists every college (for this period and group); the chosen one is highlighted.
        var colleges = COLLEGES.map(function (name, i) {
            var total = 0;
            CONDITIONS.forEach(function (cond) {
                slots.forEach(function (s) { total += conditionCells(cond, s, factor)[i]; });
            });
            return { name: name, total: total };
        }).sort(function (a, b) { return b.total - a.total; });

        var bmi = BMI.map(function (cat) {
            var cells = split(Math.round(cat.base * factor * BMI_PERIOD[state.period]));
            return { name: cat.name, cls: cat.cls, total: pick(cells, state.college) };
        });

        return { conditions: conditions, colleges: colleges, bmi: bmi };
    }

    // ---------- Drawing ----------
    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function sum(list) { return list.reduce(function (a, r) { return a + r.total; }, 0); }

    function headRow(first, second, withTrend) {
        var row = el('div', 'stat-row head' + (withTrend ? '' : ' no-trend'));
        row.setAttribute('aria-hidden', 'true');
        row.appendChild(el('span', 'stat-label', first));
        row.appendChild(el('span', 'stat-track-head', ''));
        row.appendChild(el('span', 'stat-value', second));
        if (withTrend) row.appendChild(el('span', 'stat-trend', 'vs last week'));
        return row;
    }

    function dataRow(item, max, total, options) {
        var o = options || {};
        var row = el('div', 'stat-row' + (o.trend ? '' : ' no-trend') + (o.selected ? ' is-selected' : '') + (o.rising ? ' is-rising' : ''));
        row.setAttribute('role', 'listitem');

        var label = el('span', 'stat-label', item.name);
        if (o.selected) label.appendChild(el('span', 'pill neutral', 'Selected'));
        if (o.rising) label.appendChild(el('span', 'pill red', 'Rising'));
        row.appendChild(label);

        var track = el('span', 'stat-track');
        track.setAttribute('aria-hidden', 'true');
        var fill = el('i', 'stat-fill' + (item.cls ? ' ' + item.cls : ''));
        fill.style.width = (max ? Math.round(item.total / max * 100) : 0) + '%';
        track.appendChild(fill);
        row.appendChild(track);

        var value = el('span', 'stat-value', String(item.total));
        value.appendChild(el('small', '', total ? '(' + Math.round(item.total / total * 100) + '%)' : '(0%)'));
        row.appendChild(value);

        if (o.trend) {
            var diff = item.now - item.last;
            var text = diff > 0 ? '\u25B2 +' + diff : diff < 0 ? '\u25BC \u2212' + Math.abs(diff) : '\u2014 0';
            var cls = 'stat-trend' + (item.rising ? ' flag' : diff > 0 ? ' up' : diff < 0 ? ' down' : '');
            var trend = el('span', cls, text);
            trend.setAttribute('aria-label', diff > 0 ? 'up ' + diff + ' compared with last week' : diff < 0 ? 'down ' + Math.abs(diff) + ' compared with last week' : 'no change compared with last week');
            row.appendChild(trend);
        }
        return row;
    }

    function draw(container, totalNode, list, headA, headB, unit, options) {
        var o = options || {};
        var total = sum(list);
        container.textContent = '';
        totalNode.textContent = total + ' ' + (total === 1 ? unit.one : unit.many);
        if (!total) {
            container.appendChild(el('p', 'stat-empty', 'No ' + unit.many + ' for this selection.'));
            return;
        }
        container.appendChild(headRow(headA, headB, !!o.trend));
        var max = list.reduce(function (m, r) { return Math.max(m, r.total); }, 0);
        list.forEach(function (item) {
            container.appendChild(dataRow(item, max, total, {
                trend: o.trend,
                rising: o.trend && item.rising,
                selected: o.selectedName && item.name === o.selectedName
            }));
        });
    }

    function joinNames(names) {
        if (names.length <= 1) return names.join('');
        return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    }

    function drawAlert(result, scope) {
        var box = document.getElementById('stat-alert');
        var rising = result.conditions.filter(function (c) { return c.rising; });
        box.textContent = '';
        box.hidden = false;
        if (rising.length) {
            box.className = 'alert';
            var parts = rising.map(function (c) { return c.name + ' (' + c.last + ' \u2192 ' + c.now + ')'; });
            box.appendChild(document.createTextNode('Possible outbreak' + scope + ': ' + joinNames(parts) + ' rising this week compared with last week.'));
            box.appendChild(el('span', 'alert-sub', 'Sample rule: at least ' + ALERT_MIN_THIS_WEEK + ' cases this week and at least ' + ALERT_RATIO + '\u00D7 last week. The real rule is for the doctor to set.'));
        } else {
            box.className = 'alert is-clear';
            box.appendChild(document.createTextNode('No condition is rising sharply this week' + scope + '.'));
        }
    }

    function apply() {
        var state = {
            period: period.value,
            college: college.value,
            group: group.value
        };
        var result = compute(state);
        var scope = (state.college ? ' in ' + state.college : '') + (state.group !== 'Students' ? ' (' + state.group + ')' : '');

        draw(document.getElementById('stat-conditions'), document.getElementById('stat-conditions-total'),
            result.conditions, 'Condition', 'Cases', { one: 'case', many: 'cases' }, { trend: true });
        draw(document.getElementById('stat-colleges'), document.getElementById('stat-colleges-total'),
            result.colleges, 'College', 'Cases', { one: 'case', many: 'cases' }, { selectedName: state.college });
        draw(document.getElementById('stat-bmi'), document.getElementById('stat-bmi-total'),
            result.bmi, 'Category', 'Records', { one: 'record', many: 'records' });
        drawAlert(result, scope);

        var cases = sum(result.conditions);
        document.getElementById('stat-summary').textContent =
            'Showing ' + cases + (cases === 1 ? ' case' : ' cases') + ' \u00B7 ' + state.group + ' \u00B7 ' +
            (state.college || 'All colleges') + ' \u00B7 ' + PERIOD_LABEL[state.period];
    }

    [period, college, group].forEach(function (s) { s.addEventListener('change', apply); });
    reset.addEventListener('click', function () {
        period.value = 'month';
        college.value = '';
        group.value = 'Students';
        apply();
    });
    apply();
})();
