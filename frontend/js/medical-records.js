/* Student Records list: loads every patient from GET /api/patients.
   Columns: ID, Name, Department (the college value), Age (from date of birth), Last visit.
   Doctors see the page read-only (no Add student button). */
(function () {
    'use strict';
    const body = document.getElementById('mr-body');
    const search = document.getElementById('mr-search');
    const clear = document.getElementById('mr-clear');
    const count = document.getElementById('mr-count');
    const tabsBox = document.getElementById('mr-tabs');
    const api = window.ClinicAPI;
    if (!body || !search || !tabsBox || !api) return;

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let students = [];
    let department = '';
    let timer;

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

    function messageRow(text) {
        return '<tr class="no-match"><td colspan="6">' + escapeHtml(text) + '</td></tr>';
    }

    function buildTabs() {
        const names = [];
        students.forEach(function (s) {
            const n = String(s.college || '').trim();
            if (n && names.indexOf(n) === -1) names.push(n);
        });
        names.sort();
        let html = '<a href="#" data-department=""' + (department === '' ? ' class="on" aria-current="true"' : '') + '>All ' + students.length + '</a>';
        names.forEach(function (n) {
            const total = students.filter(function (s) { return String(s.college || '').trim() === n; }).length;
            const active = department === n;
            html += '<a href="#" data-department="' + escapeHtml(n) + '"' + (active ? ' class="on" aria-current="true"' : '') + '>' +
                escapeHtml(n) + ' ' + total + '</a>';
        });
        tabsBox.innerHTML = html;
    }

    // The server already filtered by the search box; the department tab narrows the loaded list.
    function render() {
        const list = students.filter(function (s) {
            return !department || String(s.college || '').trim() === department;
        });
        if (!list.length) {
            body.innerHTML = messageRow(search.value.trim() || department ? 'No students match your filters.' : 'No students yet. Use + Add student to register one.');
        } else {
            body.innerHTML = list.map(function (s) {
                const link = '../nurse/record-detail.html?id=' + encodeURIComponent(s.id);
                return '<tr>' +
                    '<td>' + escapeHtml(s.id) + '</td>' +
                    '<td><a href="' + link + '"><strong>' + escapeHtml(s.name) + '</strong></a></td>' +
                    '<td>' + (s.college ? escapeHtml(s.college) : '<span style="color:var(--m)">&mdash;</span>') + '</td>' +
                    '<td>' + escapeHtml(ageFrom(s.dateOfBirth)) + '</td>' +
                    '<td>' + (s.lastVisit ? escapeHtml(formatDate(s.lastVisit)) : '<span style="color:var(--m)">No visits yet</span>') + '</td>' +
                    '<td><a href="' + link + '">Open &rsaquo;</a></td>' +
                    '</tr>';
            }).join('');
        }
        count.textContent = (search.value.trim() || department)
            ? 'Showing ' + list.length + ' students'
            : students.length + ' students';
    }

    function fail(error) {
        if (error.status === 401) { window.location.assign('/index.html'); return; }
        body.innerHTML = messageRow(error.message);
        count.textContent = '';
    }

    async function load() {
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(search.value.trim()));
            students = result.patients;
            if (department && !students.some(function (s) { return String(s.college || '').trim() === department; })) department = '';
            buildTabs();
            render();
        } catch (error) { fail(error); }
    }

    tabsBox.addEventListener('click', function (event) {
        const tab = event.target.closest('a[data-department]');
        if (!tab) return;
        event.preventDefault();
        department = tab.dataset.department;
        buildTabs();
        render();
    });
    search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(load, 250);
    });
    clear.addEventListener('click', function () {
        search.value = '';
        department = '';
        load();
        search.focus();
    });

    // Doctors see this page read-only: show the tag and hide Add student. Nurses see the button.
    api.getSession().then(function (session) {
        if (session.user.role === 'doctor') {
            const tag = document.getElementById('readonly-tag');
            const add = document.getElementById('add-student');
            const imp = document.getElementById('import-students');
            if (tag) tag.hidden = false;
            if (add) add.hidden = true;
            if (imp) imp.hidden = true;
        }
    }).catch(fail);

    load();
})();
