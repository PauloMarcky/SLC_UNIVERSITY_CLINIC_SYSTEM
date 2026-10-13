/* Medical Records page: loads students from the database (/api/patients), builds the college tabs
   from the data, and narrows the rows with the tabs and the search box. Also shows the Read-only tag for doctors.
   The requirement columns show a dash until the backend stores that data. */
(function () {
    'use strict';
    const body = document.getElementById('mr-body');
    const search = document.getElementById('mr-search');
    const clear = document.getElementById('mr-clear');
    const count = document.getElementById('mr-count');
    const tabsBox = document.getElementById('mr-tabs');
    if (!body || !search || !tabsBox) return;

    let students = [];
    let college = '';

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function messageRow(text) {
        return '<tr class="no-match"><td colspan="11">' + escapeHtml(text) + '</td></tr>';
    }

    function buildTabs() {
        const names = [];
        students.forEach(function (s) {
            const name = String(s.college || '').trim();
            if (name && names.indexOf(name) === -1) names.push(name);
        });
        names.sort();
        let html = '<a href="#" data-college=""' + (college === '' ? ' class="on" aria-current="true"' : '') + '>All (' + students.length + ')</a>';
        names.forEach(function (name) {
            const total = students.filter(function (s) { return String(s.college || '').trim() === name; }).length;
            const active = college === name;
            html += '<a href="#" data-college="' + escapeHtml(name) + '"' + (active ? ' class="on" aria-current="true"' : '') + '>' +
                escapeHtml(name) + ' (' + total + ')</a>';
        });
        html += '<a href="#emp">Employees</a>';
        tabsBox.innerHTML = html;
    }

    function render() {
        const text = search.value.trim().toLowerCase();
        const list = students.filter(function (s) {
            const matchText = !text || (String(s.id) + ' ' + String(s.name)).toLowerCase().indexOf(text) !== -1;
            const matchCollege = !college || String(s.college || '').trim() === college;
            return matchText && matchCollege;
        });

        if (!list.length) {
            body.innerHTML = messageRow(students.length ? 'No students match your filters.' : 'No students found.');
        } else {
            body.innerHTML = list.map(function (s) {
                return '<tr>' +
                    '<td>' + escapeHtml(s.id) + '</td>' +
                    '<td><a href="../nurse/record-detail.html?id=' + encodeURIComponent(s.id) + '">' + escapeHtml(s.name) + '</a></td>' +
                    '<td>' + escapeHtml(s.college) + '</td>' +
                    '<td>' + escapeHtml(s.course) + '</td>' +
                    '<td>' + escapeHtml(s.year) + '</td>' +
                    '<td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td>' +
                    '</tr>';
            }).join('');
        }

        const filtering = text || college;
        count.textContent = filtering
            ? 'Showing ' + list.length + ' of ' + students.length + ' students'
            : students.length + ' students';
    }

    tabsBox.addEventListener('click', function (event) {
        const tab = event.target.closest('a[data-college]');
        if (!tab) return; // the Employees link scrolls to its section as normal
        event.preventDefault();
        college = tab.dataset.college;
        buildTabs();
        render();
    });
    search.addEventListener('input', render);
    clear.addEventListener('click', function () {
        search.value = '';
        college = '';
        buildTabs();
        render();
        search.focus();
    });

    async function loadStudents() {
        try {
            const response = await fetch('../api/patients?search=', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Request failed: ' + response.status);
            const data = await response.json();
            students = Array.isArray(data.patients)
                ? data.patients.filter(function (s) { return s.category === 'student'; })
                : [];
            buildTabs();
            render();
        } catch (error) {
            body.innerHTML = messageRow('Unable to load student records. Check that the server is running and you are logged in.');
            count.textContent = '';
            console.error(error);
        }
    }
    loadStudents();

    // Doctors see this page read-only; nurses do not get the tag.
    if (location.protocol !== 'file:') {
        fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (s) {
                const tag = document.getElementById('readonly-tag');
                if (tag && s && s.user && s.user.role === 'doctor') tag.hidden = false;
            })
            .catch(function () { /* leave the tag hidden */ });
    }
})();