/* Statistics page: every number comes from the database.
   GET /api/statistics/morbidity    cases per condition (period + department)
   GET /api/statistics/distribution visits per department
   GET /api/statistics/trends       BMI categories and this-week vs last-week counts (outbreak check) */
(function () {
    'use strict';

    var period = document.getElementById('stat-period');
    var college = document.getElementById('stat-college');
    var view = document.getElementById('stat-view');
    if (view) {
        var wanted = new URLSearchParams(location.search).get('view');
        if (wanted && Array.prototype.some.call(view.options, function (o) { return o.value === wanted; })) view.value = wanted;
    }
    var reset = document.getElementById('stat-reset');
    if (!period || !college) return;

    while (college.options.length > 1) college.remove(1);
    if (window.SLCDepartments) window.SLCDepartments.fillSelect(college, { short: true });

    var PERIOD_LABEL = { all: 'All time', month: 'This month', week: 'This week' };
    function deptShort(value) { return window.SLCDepartments ? window.SLCDepartments.short(value) : value; }
    var VIEW_LABEL = { '': 'All combined', screened: 'Screened', checkup: 'Checkup', consultation: 'Consultation' };
    var VIEW_TITLE = { '': 'Statistics', screened: 'Statistics: Screened Records', checkup: 'Statistics: Checkups', consultation: 'Statistics: Consultations' };
    var BMI_CLASS = [['under', 'fill-under'], ['normal', 'fill-normal'], ['over', 'fill-over'], ['obes', 'fill-obese']];

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

    function dataRow(item, max, total, o) {
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

    function draw(containerId, totalId, list, headA, headB, unit, o) {
        o = o || {};
        var container = document.getElementById(containerId);
        var totalNode = document.getElementById(totalId);
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

    function drawAlert(conditions, rule, scope) {
        var box = document.getElementById('stat-alert');
        var rising = conditions.filter(function (c) { return c.rising; });
        box.textContent = '';
        box.hidden = false;
        if (rising.length) {
            box.className = 'alert';
            var parts = rising.map(function (c) { return c.name + ' (' + c.last + ' \u2192 ' + c.now + ')'; });
            box.appendChild(document.createTextNode('Possible outbreak' + scope + ': ' + joinNames(parts) + ' rising this week compared with last week.'));
            box.appendChild(el('span', 'alert-sub', 'Rule: at least ' + rule.minThisWeek + ' cases this week and at least ' + rule.ratio + '\u00D7 last week.'));
        } else {
            box.className = 'alert is-clear';
            box.appendChild(document.createTextNode('No condition is rising sharply this week' + scope + '.'));
        }
    }

    function showError(text) {
        var box = document.getElementById('stat-alert');
        box.textContent = text;
        box.className = 'alert';
        box.hidden = false;
        document.getElementById('stat-summary').textContent = '';
    }

    // ---------- Loading ----------
    function getJson(url) {
        return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
            if (r.status === 401) { window.location.assign('/index.html'); return null; }
            if (!r.ok) return r.text().then(function (t) { throw new Error('Could not load ' + url + ' (' + r.status + '). ' + t.slice(0, 300)); });
            return r.json();
        });
    }

    function isoDaysAgo(days) {
        var d = new Date();
        d.setDate(d.getDate() - days);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function bmiClass(name) {
        var n = String(name).toLowerCase();
        for (var i = 0; i < BMI_CLASS.length; i++) if (n.indexOf(BMI_CLASS[i][0]) >= 0) return BMI_CLASS[i][1];
        return '';
    }

    function apply() {
        var chosen = college.value;
        var viewKey = view ? view.value : '';
        var title = document.getElementById('stat-title');
        if (title) title.textContent = VIEW_TITLE[viewKey] || 'Statistics';
        var query = [];
        if (chosen) query.push('college=' + encodeURIComponent(chosen));
        if (viewKey) query.push('scope=' + encodeURIComponent(viewKey));
        if (period.value === 'week') query.push('startDate=' + isoDaysAgo(7));
        else if (period.value === 'month') query.push('startDate=' + isoDaysAgo(30));
        var qs = query.length ? '?' + query.join('&') : '';
        var datesOnly = query.filter(function (q) { return q.indexOf('college=') !== 0; });
        var dateQs = datesOnly.length ? '?' + datesOnly.join('&') : '';

        var exportBtn = document.getElementById('stat-export');
        if (exportBtn) exportBtn.href = '/api/statistics/export' + qs;

        Promise.all([
            getJson('/api/statistics/morbidity' + qs),
            getJson('/api/statistics/distribution' + dateQs),
            getJson('/api/statistics/trends' + qs)
        ]).then(function (res) {
            if (!res[0] || !res[1] || !res[2]) return;
            var morb = res[0].morbidity, dist = res[1].distribution, trends = res[2].trends;

            var weekly = {};
            trends.weekly.forEach(function (w) { weekly[w.diagnosis] = w; });
            var conditions = morb.items.map(function (item) {
                var w = weekly[item.diagnosis] || { thisWeek: 0, lastWeek: 0 };
                var rising = w.thisWeek >= trends.rule.minThisWeek && w.thisWeek >= w.lastWeek * trends.rule.ratio;
                return { name: item.diagnosis, total: item.caseCount, last: w.lastWeek, now: w.thisWeek, rising: rising };
            });
            var departments = dist.byCollege.map(function (c) { return { name: deptShort(c.college), total: c.totalVisits }; });
            var bmi = trends.bmi.map(function (b) { return { name: b.category, cls: bmiClass(b.category), total: b.count }; });

            draw('stat-conditions', 'stat-conditions-total', conditions, 'Condition', 'Cases', { one: 'case', many: 'cases' }, { trend: true });
            draw('stat-colleges', 'stat-colleges-total', departments, 'Department', 'Visits', { one: 'visit', many: 'visits' }, { selectedName: deptShort(chosen) });
            draw('stat-bmi', 'stat-bmi-total', bmi, 'Category', 'Records', { one: 'record', many: 'records' });
            drawAlert(conditions, trends.rule, chosen ? ' in ' + deptShort(chosen) : '');

            var cases = sum(conditions);
            document.getElementById('stat-summary').textContent =
                'Showing ' + cases + (cases === 1 ? ' case' : ' cases') + ' \u00B7 ' +
                (chosen ? deptShort(chosen) : 'All departments') + ' \u00B7 ' + PERIOD_LABEL[period.value] + ' \u00B7 ' + (VIEW_LABEL[viewKey] || 'All combined');
        }).catch(function (error) { showError(error.message); });
    }

    [period, college, view].filter(Boolean).forEach(function (s) { s.addEventListener('change', apply); });
    reset.addEventListener('click', function () {
        period.value = 'month';
        college.value = '';
        if (view) view.value = '';
        apply();
    });
    apply();
})();