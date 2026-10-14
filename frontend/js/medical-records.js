/* Medical Records list (Part 2 of the student record rebuild).
   SAMPLE DATA for now: nothing here is saved. Part 6 replaces SAMPLE_STUDENTS with GET /api/patients.
   Row shape follows the backend handoff: id, name, college (shown as Department), dateOfBirth -> age, lastVisit. */
(function () {
    'use strict';
    const body = document.getElementById('mr-body');
    const search = document.getElementById('mr-search');
    const clear = document.getElementById('mr-clear');
    const count = document.getElementById('mr-count');
    const tabsBox = document.getElementById('mr-tabs');
    if (!body || !search || !tabsBox) return;

    const SAMPLE_STUDENTS = [
        { id: '2026-00123', name: 'Dela Cruz, Juan Santos', college: 'College of Information Technology', dateOfBirth: '2007-03-08', lastVisit: '2026-10-12' },
        { id: '2026-00145', name: 'Reyes, Ana Lopez', college: 'College of Nursing', dateOfBirth: '2008-05-20', lastVisit: '2026-10-09' },
        { id: '2026-00167', name: 'Garcia, Mark Villanueva', college: 'College of Information Technology', dateOfBirth: '2006-02-11', lastVisit: null },
        { id: '2026-00188', name: 'Santos, Carla Mendoza', college: 'College of Education', dateOfBirth: '2007-07-30', lastVisit: '2026-09-21' },
        { id: '2026-00201', name: 'Bautista, Paolo Ramos', college: 'College of Nursing', dateOfBirth: '2005-01-15', lastVisit: '2026-08-30' }
    ];

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let students = SAMPLE_STUDENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    let department = '';

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

    // Age from date of birth, same idea as the server will use.
    function ageFrom(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return '';
        const now = new Date();
        let age = now.getFullYear() - Number(m[1]);
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

    function render() {
        const text = search.value.trim().toLowerCase();
        const list = students.filter(function (s) {
            const matchText = !text || (s.id + ' ' + s.name).toLowerCase().indexOf(text) !== -1;
            const matchDept = !department || String(s.college || '').trim() === department;
            return matchText && matchDept;
        });

        if (!list.length) {
            body.innerHTML = messageRow('No students match your filters.');
        } else {
            body.innerHTML = list.map(function (s) {
                const link = '../nurse/record-detail.html?id=' + encodeURIComponent(s.id);
                return '<tr>' +
                    '<td>' + escapeHtml(s.id) + '</td>' +
                    '<td><a href="' + link + '"><strong>' + escapeHtml(s.name) + '</strong></a></td>' +
                    '<td>' + escapeHtml(s.college) + '</td>' +
                    '<td>' + escapeHtml(ageFrom(s.dateOfBirth)) + '</td>' +
                    '<td>' + (s.lastVisit ? escapeHtml(formatDate(s.lastVisit)) : '<span style="color:var(--m)">No visits yet</span>') + '</td>' +
                    '<td><a href="' + link + '">Open &rsaquo;</a></td>' +
                    '</tr>';
            }).join('');
        }

        count.textContent = (text || department)
            ? 'Showing ' + list.length + ' of ' + students.length + ' students'
            : students.length + ' students';
    }

    tabsBox.addEventListener('click', function (event) {
        const tab = event.target.closest('a[data-department]');
        if (!tab) return;
        event.preventDefault();
        department = tab.dataset.department;
        buildTabs();
        render();
    });
    search.addEventListener('input', render);
    clear.addEventListener('click', function () {
        search.value = '';
        department = '';
        buildTabs();
        render();
        search.focus();
    });

    buildTabs();
    render();

    // Doctors see this page read-only: show the tag and hide Add student. Nurses see the button.
    if (location.protocol !== 'file:') {
        fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (s) {
                if (s && s.user && s.user.role === 'doctor') {
                    const tag = document.getElementById('readonly-tag');
                    const add = document.getElementById('add-student');
                    if (tag) tag.hidden = false;
                    if (add) add.hidden = true;
                }
            })
            .catch(function () { /* leave the page as is */ });
    }
})();