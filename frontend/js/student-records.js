/* Student Records list. Loads students from GET /api/patients 10 at a time:
   the first 10 when the page opens, then 10 more each time the bottom of the table scrolls into view.
   The server does the search, the department filter and the counting, so every student can be reached.
   Nurses and doctors can add and import students; only nurses can edit a record. */
(function () {
    'use strict';
    const body = document.getElementById('mr-body');
    const search = document.getElementById('mr-search');
    const clear = document.getElementById('mr-clear');
    const count = document.getElementById('mr-count');
    const tabsBox = document.getElementById('mr-tabs');
    const api = window.ClinicAPI;
    if (!body || !api) return;

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const PAGE = 10;            // students fetched and drawn at a time
    let loaded = 0;             // students drawn so far
    let total = 0;              // students matching the current filters (whole database)
    let department = '';
    let query = '';
    let busy = false;
    let ticket = 0;             // lets a newer request cancel an older one
    let sentinel = null;
    let timer;
    let year = null;            // school year picker (school-year.js): the "last visit" column follows it
    const num = n => Number(n).toLocaleString('en-US');

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
        return '<tr class="no-match"><td colspan="5">' + escapeHtml(text) + '</td></tr>';
    }

    function rowHtml(s) {
        const link = '../nurse/record-detail.html?id=' + encodeURIComponent(s.id);
        return '<tr>' +
            '<td>' + escapeHtml(s.id) + '</td>' +
            '<td><a href="' + link + '"><strong>' + escapeHtml(s.name) + '</strong></a></td>' +
            '<td' + (s.college ? ' title="' + escapeHtml(s.college) + '"' : '') + '>' + (s.college ? escapeHtml(window.SLCDepartments ? window.SLCDepartments.short(s.college) : s.college) : '<span style="color:var(--m)">&mdash;</span>') + '</td>' +
            '<td>' + escapeHtml(ageFrom(s.dateOfBirth)) + '</td>' +
            '<td>' + (s.lastVisit ? escapeHtml(formatDate(s.lastVisit)) : '<span style="color:var(--m)">' + (year && year.value() ? 'No visits this school year' : 'No visits yet') + '</span>') + '</td>' +
            '' +
            '</tr>';
    }

    function buildTabs(all, colleges) {
        let html = '<a href="#" data-department=""' + (department === '' ? ' class="on" aria-current="true"' : '') + '>All ' + num(all) + '</a>';
        colleges.forEach(function (c) {
            const active = department === c.name;
            html += '<a href="#" data-department="' + escapeHtml(c.name) + '" title="' + escapeHtml(c.name) + '"' + (active ? ' class="on" aria-current="true"' : '') + '>' +
                escapeHtml(window.SLCDepartments ? window.SLCDepartments.short(c.name) : c.name) + ' ' + num(c.count) + '</a>';
        });
        if (tabsBox) tabsBox.innerHTML = html;
    }

    function setCount() {
        count.textContent = (query || department)
            ? 'Showing ' + num(loaded) + ' of ' + num(total) + ' students'
            : num(total) + ' students';
    }

    // Fetches the next 10 when the "Scroll down" row comes into view.
    const observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) fetchPage(false);
    }, { rootMargin: '100px' });

    function removeSentinel() {
        if (!sentinel) return;
        observer.unobserve(sentinel);
        sentinel.remove();
        sentinel = null;
    }

    function addSentinel() {
        sentinel = document.createElement('tr');
        sentinel.className = 'no-match';
        sentinel.innerHTML = '<td colspan="5">Scroll down to load more...</td>';
        body.appendChild(sentinel);
        observer.observe(sentinel);
    }

    function fail(error) {
        if (error.status === 401) { window.location.assign('/index.html'); return; }
        removeSentinel();
        if (loaded === 0) {
            body.innerHTML = messageRow(error.message);
            count.textContent = '';
        } else {
            body.insertAdjacentHTML('beforeend', messageRow('Could not load more students. ' + error.message));
        }
    }

    // reset = true starts again from the first 10 (new search, new department); false adds the next 10.
    async function fetchPage(reset) {
        if (busy && !reset) return;
        const mine = ++ticket;
        busy = true;
        if (reset) {
            loaded = 0;
            query = search ? search.value.trim() : '';
            removeSentinel();
            body.innerHTML = messageRow('Loading students...');
        }
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(query) +
                '&college=' + encodeURIComponent(department) + '&limit=' + PAGE + '&offset=' + loaded +
                (year && year.value() ? '&schoolYear=' + encodeURIComponent(year.value()) : ''));
            if (mine !== ticket) return;
            if (reset && department && !result.colleges.some(function (c) { return c.name === department; })) {
                department = '';            // the chosen department has no match for this search
                return fetchPage(true);
            }
            removeSentinel();
            if (reset) {
                body.innerHTML = '';
                buildTabs(result.all, result.colleges);
            }
            total = result.total;
            body.insertAdjacentHTML('beforeend', result.patients.map(rowHtml).join(''));
            loaded += result.patients.length;
            if (!loaded) {
                body.innerHTML = messageRow(query || department ? 'No students match your filters.' : 'No students yet. Use + Add student to register one.');
            } else if (loaded < total && result.patients.length) {
                addSentinel();
            }
            setCount();
        } catch (error) {
            if (mine === ticket) fail(error);
        } finally {
            if (mine === ticket) busy = false;
        }
    }

    if (tabsBox) tabsBox.addEventListener('click', function (event) {
        const tab = event.target.closest('a[data-department]');
        if (!tab) return;
        event.preventDefault();
        department = tab.dataset.department;
        fetchPage(true);
    });
    if (search) search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { fetchPage(true); }, 250);
    });
    if (clear) clear.addEventListener('click', function () {
        search.value = '';
        department = '';
        fetchPage(true);
        search.focus();
    });

    // After an Excel import adds students, show them in the list.
    window.addEventListener('students:changed', function () { fetchPage(true); });

    // Nurses and doctors both see Add student and Import from Excel. Any other role gets the read-only tag.
    api.getSession().then(function (session) {
        if (session.user.role !== 'doctor' && session.user.role !== 'nurse') {
            const tag = document.getElementById('readonly-tag');
            const add = document.getElementById('add-student');
            const imp = document.getElementById('import-students');
            if (tag) tag.hidden = false;
            if (add) add.hidden = true;
            if (imp) imp.hidden = true;
        }
    }).catch(fail);

    const yearSelect = document.getElementById('mr-year');
    if (yearSelect && window.SchoolYear) {
        window.SchoolYear.mount(yearSelect, { onChange: function () { fetchPage(true); } }).then(function (picker) { year = picker; fetchPage(true); });
    } else {
        fetchPage(true);
    }
})();