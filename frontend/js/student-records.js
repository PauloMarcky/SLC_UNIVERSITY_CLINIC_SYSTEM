/* Student Records list. Loads students from GET /api/patients 10 at a time:
   the first 10 when the page opens, then 10 more each time the bottom of the table scrolls into view.
   The server does the search, the department filter and the counting, so every student can be reached.
   One toolbar: search, Department dropdown (built from the server's department counts), Clear.
   Doctors see the page read-only (Read-only tag, no Add or Import buttons, no "register" hint). */
(function () {
    'use strict';
    const body = document.getElementById('mr-body');
    const search = document.getElementById('mr-search');
    const clear = document.getElementById('mr-clear');
    const count = document.getElementById('mr-count');
    const select = document.getElementById('mr-department');
    const api = window.ClinicAPI;
    if (!body || !search || !select || !api) return;

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
        return '<tr class="no-match"><td colspan="6">' + escapeHtml(text) + '</td></tr>';
    }

    function rowHtml(s) {
        const link = '../nurse/record-detail.html?id=' + encodeURIComponent(s.id);
        return '<tr>' +
            '<td>' + escapeHtml(s.id) + '</td>' +
            '<td><a href="' + link + '"><strong>' + escapeHtml(s.name) + '</strong></a></td>' +
            '<td>' + (s.college ? escapeHtml(s.college) : '<span style="color:var(--m)">&mdash;</span>') + '</td>' +
            '<td>' + escapeHtml(ageFrom(s.dateOfBirth)) + '</td>' +
            '<td>' + (s.lastVisit ? escapeHtml(formatDate(s.lastVisit)) : '<span style="color:var(--m)">No visits yet</span>') + '</td>' +
            '<td><a href="' + link + '">Open &rsaquo;</a></td>' +
            '</tr>';
    }

    // Department dropdown: one option per department that has a match for the current search.
    // The chosen department stays in the list (with 0) even when the search has no match in it.
    function buildDepartments(all, colleges) {
        const list = colleges.slice();
        if (department && !list.some(function (c) { return c.name === department; })) {
            list.push({ name: department, count: 0 });
        }
        let html = '<option value="">All departments (' + num(all) + ')</option>';
        list.forEach(function (c) {
            html += '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + ' (' + num(c.count) + ')</option>';
        });
        select.innerHTML = html;
        select.value = department;
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
        sentinel.innerHTML = '<td colspan="6">Scroll down to load more...</td>';
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
            query = search.value.trim();
            removeSentinel();
            body.innerHTML = messageRow('Loading students...');
        }
        try {
            const result = await api.request('/api/patients?search=' + encodeURIComponent(query) +
                '&college=' + encodeURIComponent(department) + '&limit=' + PAGE + '&offset=' + loaded);
            if (mine !== ticket) return;
            removeSentinel();
            if (reset) {
                body.innerHTML = '';
                buildDepartments(result.all, result.colleges);
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

    select.addEventListener('change', function () {
        department = select.value;
        fetchPage(true);
    });
    search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { fetchPage(true); }, 250);
    });
    clear.addEventListener('click', function () {
        search.value = '';
        department = '';
        select.value = '';
        fetchPage(true);
        search.focus();
    });

    // Doctors see this page read-only: show the tag and hide the Add and Import buttons.
    // Nurses get the "register a new student" hint added to the note under the title.
    api.getSession().then(function (session) {
        const sub = document.getElementById('mr-sub');
        if (session.user.role === 'doctor') {
            const tag = document.getElementById('readonly-tag');
            const add = document.getElementById('add-student');
            const imp = document.getElementById('import-students');
            if (tag) tag.hidden = false;
            if (add) add.hidden = true;
            if (imp) imp.hidden = true;
        } else if (sub) {
            sub.textContent = 'Search a student and open the record, or register a new student.';
        }
    }).catch(fail);

    fetchPage(true);
})();