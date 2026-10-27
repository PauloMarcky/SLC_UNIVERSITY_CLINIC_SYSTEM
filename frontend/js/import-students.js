/* Import students from Excel (nurses and doctors), shown as a window on the Student Records page.
   1. The file is read in a Web Worker (js/import-worker.js), so the page stays responsive on big files.
   2. A preview shows what is ready, already in the system, or has a problem. Nothing is saved yet.
   3. Saving sends one POST /api/patients per student, a few at a time, with a progress bar and a Cancel button.
      A student already enrolled in the current school year (409) is skipped. A student from an earlier year is enrolled again.
   When students were added, the page is told through the "students:changed" event so the list refreshes. */
(function () {
    'use strict';
    const api = window.ClinicAPI;
    const modal = document.getElementById('import-modal');
    const openButton = document.getElementById('import-students');
    if (!api || !modal || !openButton || !document.getElementById('imp-file')) return;
    const $ = id => document.getElementById(id);

    const MAX_BYTES = Infinity; // no file size limit
    const AT_ONCE = 4;          // requests in flight while saving
    const SHOW_LIMIT = 200;     // table rows drawn at once (a 10,000-row table would freeze the page)
    const LIST_LIMIT = 500;     // GET /api/patients returns at most this many

    let rows = [];              // [{row, id, lastName, ..., status, note}]
    let existingIds = new Set();
    let existingAll = false;    // true only when every existing student ID was loaded
    let existingLoaded = false;
    let filter = 'all';
    let reader = null;          // the Web Worker
    let importing = false;
    let cancelled = false;
    let fileName = '';
    let sheetInfo = '';
    let dept = '';
    let lastFocus = null;

    const num = n => Number(n).toLocaleString('en-US');
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }
    function message(text, focus) {
        const box = $('imp-message');
        box.textContent = text;
        box.hidden = !text;
        box.className = 'note save-result' + (text ? ' user-message-error' : '');
        if (text && focus) { box.focus(); box.scrollIntoView({ block: 'center' }); }
    }
    function show(id, visible) { $(id).hidden = !visible; }
    function count(statuses) { return rows.filter(r => statuses.indexOf(r.status) !== -1).length; }
    function authFail(error) {
        if (error.status === 401) { window.location.assign('/index.html'); return true; }
        return false;
    }

    /* ---------- open and close the window ---------- */
    function openModal() {
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        loadExisting();
        if (!importing && !rows.length) $('imp-file').focus();
    }
    function closeModal() {
        if (importing) { message('The import is still running. Use Cancel to stop it first.', true); return; }
        reset();
        modal.hidden = true;
        document.body.classList.remove('modal-open');
        if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    }
    openButton.addEventListener('click', openModal);
    modal.querySelectorAll('[data-close-import]').forEach(function (el) { el.addEventListener('click', closeModal); });
    $('imp-close-done').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !modal.hidden) closeModal();
    });

    /* ---------- existing students (loaded the first time the window opens) ---------- */
    function loadExisting() {
        if (existingLoaded) return;
        existingLoaded = true;
        api.request('/api/patients?search=&limit=1&schoolYear=current').then(function (result) {
            const names = (window.SLCDepartments ? window.SLCDepartments.options : []).slice();
            result.colleges.forEach(function (c) { if (names.indexOf(c.name) < 0) names.push(c.name); });
            $('imp-dept-list').innerHTML = names.map(function (n) {
                return '<option value="' + escapeHtml(n) + '"></option>';
            }).join('');
            if (result.all >= LIST_LIMIT) { existingAll = false; return null; }
            return api.request('/api/patients?search=&schoolYear=current').then(function (list) {
                list.patients.forEach(function (p) { existingIds.add(String(p.id).toLowerCase()); });
                existingAll = true;
            });
        }).catch(function (error) {
            existingLoaded = false;
            existingAll = false;
            authFail(error);
        });
    }

    /* ---------- step 1: read the file ---------- */
    function stopReader() { if (reader) { reader.terminate(); reader = null; } }

    function reading(text) {
        show('imp-reading', Boolean(text));
        if (text) $('imp-reading-text').textContent = text;
    }

    $('imp-file').addEventListener('change', async function () {
        const file = this.files && this.files[0];
        message('');
        stopReader();
        rows = [];
        show('imp-preview', false);
        if (!file) { reading(''); return; }
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            reading('');
            message('Choose an Excel file ending in .xlsx or .xls. (If you have a CSV, open it in Excel and save it as .xlsx.)', true);
            return;
        }
        if (file.size > MAX_BYTES) {
            reading('');
            message('This file is ' + (file.size / 1048576).toFixed(1) + ' MB. The limit is 10 MB; split it and import the parts one by one.', true);
            return;
        }
        fileName = file.name;
        reading('Opening the file...');
        let buffer;
        try { buffer = await file.arrayBuffer(); }
        catch (_) { reading(''); message('The file could not be opened. Close it in Excel and try again.', true); return; }

        try { reader = new Worker('../js/import-worker.js'); }
        catch (_) { reading(''); message('This browser cannot read Excel files in the background. Use a current Chrome, Edge or Firefox.', true); return; }
        const mine = reader;
        mine.onmessage = function (event) {
            if (mine !== reader) return;
            const data = event.data;
            if (data.type === 'progress') { reading(data.text); return; }
            stopReader();
            reading('');
            if (data.type === 'error') { message(data.message, true); return; }
            onParsed(data);
        };
        mine.onerror = function (event) {
            if (mine !== reader) return;
            if (event && event.preventDefault) event.preventDefault();
            stopReader();
            reading('');
            message('The Excel reader could not start. Check that the file frontend/vendor/xlsx.full.min.js exists, then reload this page.', true);
        };
        mine.postMessage({ buffer: buffer }, [buffer]);
    });

    function onParsed(data) {
        rows = data.rows.map(function (r) {
            if (r.problem) { r.status = 'problem'; r.note = r.problem; }
            else if (existingIds.has(r.id.toLowerCase())) { r.status = 'exists'; r.note = 'Already enrolled this school year'; }
            else r.status = 'ready';
            return r;
        });
        sheetInfo = 'Sheet "' + data.sheetName + '", header on row ' + data.headerRow + '.';
        if (!rows.length) { message('No students were found under the header row.', true); return; }
        filter = 'all';
        renderPreview();
        show('imp-preview', true);
        $('imp-preview').scrollIntoView({ block: 'start' });
    }

    /* ---------- step 2: preview ---------- */
    const GROUPS = [
        ['all', 'All', null],
        ['ready', 'Ready', ['ready']],
        ['added', 'Added', ['added']],
        ['exists', 'Already enrolled', ['exists']],
        ['bad', 'Problems', ['problem', 'failed']],
        ['notdone', 'Not processed', ['notdone']]
    ];

    function countBoxes(items) {
        return items.map(function (i) {
            return '<div class="imp-count ' + i[2] + '"><strong>' + num(i[1]) + '</strong><span>' + i[0] + '</span></div>';
        }).join('');
    }

    function renderPreview() {
        const ready = count(['ready']);
        $('imp-preview-title').textContent = '2. Check the preview';
        $('imp-file-info').textContent = fileName + '. ' + sheetInfo + (existingAll ? '' :
            ' The system has many students, so ones that are already saved may only be found while saving; they are skipped.');
        $('imp-counts').innerHTML = countBoxes([
            ['Rows in the file', rows.length, ''],
            ['Ready to import', ready, 'ok'],
            ['Already enrolled this school year', count(['exists']), 'wn'],
            ['Problems (skipped)', count(['problem']), 'er']
        ]);
        const start = $('imp-start');
        start.textContent = ready ? 'Import ' + num(ready) + ' student' + (ready === 1 ? '' : 's') : 'Nothing to import';
        start.disabled = !ready;
        show('imp-actions', true);
        renderTabs();
        renderTable();
    }

    function renderTabs() {
        $('imp-tabs').innerHTML = GROUPS.filter(function (g) { return g[2] === null || count(g[2]) > 0; }).map(function (g) {
            const total = g[2] === null ? rows.length : count(g[2]);
            return '<a href="#" data-filter="' + g[0] + '"' + (filter === g[0] ? ' class="on" aria-current="true"' : '') + '>' + g[1] + ' ' + num(total) + '</a>';
        }).join('');
    }

    function statusCell(r) {
        switch (r.status) {
            case 'ready': return '<span class="pill green">Ready</span>';
            case 'added': return '<span class="pill green">Added</span>';
            case 'exists': return '<span class="pill yellow">Already enrolled</span>';
            case 'notdone': return '<span class="pill neutral">Not processed</span>';
            case 'failed': return '<span class="pill red">Not saved</span><span class="imp-reason c-bad">' + escapeHtml(r.note) + '</span>';
            default: return '<span class="pill red">Problem</span><span class="imp-reason c-bad">' + escapeHtml(r.note) + '</span>';
        }
    }

    // Under the course in the preview: the department it will be saved under.
    function departmentNote(course) {
        const d = window.SLCDepartments ? window.SLCDepartments.forCourse(course) : '';
        return d ? '<br><small title="' + escapeHtml(d) + '">Department: ' + escapeHtml(window.SLCDepartments.short(d)) + '</small>' : '';
    }

    function renderTable() {
        const group = GROUPS.filter(g => g[0] === filter)[0] || GROUPS[0];
        const list = group[2] === null ? rows : rows.filter(r => group[2].indexOf(r.status) !== -1);
        const shown = list.slice(0, SHOW_LIMIT);
        $('imp-body').innerHTML = shown.map(function (r) {
            const cls = r.status === 'problem' || r.status === 'failed' ? ' class="imp-row-bad"' : r.status === 'exists' ? ' class="imp-row-skip"' : '';
            return '<tr' + cls + '><td>' + r.row + '</td><td>' + escapeHtml(r.id) + '</td><td>' + escapeHtml(r.lastName) + '</td><td>' +
                escapeHtml(r.firstName) + '</td><td>' + escapeHtml(r.middleName) + '</td><td>' + escapeHtml(r.gender) + '</td><td>' +
                escapeHtml(r.course) + departmentNote(r.course) + '</td><td>' + escapeHtml(r.year) + '</td><td class="imp-status">' + statusCell(r) + '</td></tr>';
        }).join('') || '<tr class="no-match"><td colspan="9">No rows in this view.</td></tr>';
        const limit = $('imp-limit');
        limit.hidden = list.length <= SHOW_LIMIT;
        limit.textContent = 'Showing the first ' + SHOW_LIMIT + ' of ' + num(list.length) + ' rows. Every row is still imported.';
    }

    $('imp-tabs').addEventListener('click', function (event) {
        const tab = event.target.closest('a[data-filter]');
        if (!tab) return;
        event.preventDefault();
        filter = tab.dataset.filter;
        renderTabs();
        renderTable();
    });

    $('imp-again').addEventListener('click', function () { reset(); $('imp-file').focus(); });
    $('imp-new').addEventListener('click', function () { reset(); $('imp-file').focus(); });

    function reset() {
        stopReader();
        rows = [];
        message('');
        $('imp-file').value = '';
        reading('');
        show('imp-preview', false);
        show('imp-run', false);
        show('imp-done', false);
        show('imp-pick', true);
    }

    /* ---------- step 3: save ---------- */
    let paint = 0;
    function updateProgress(total, tally) {
        if (paint) return;
        paint = setTimeout(function () {
            paint = 0;
            const done = tally.added + tally.exists + tally.failed;   // read live so the numbers always agree
            $('imp-progress').max = total || 1;
            $('imp-progress').value = done;
            $('imp-progress-text').textContent = num(done) + ' of ' + num(total) + ' done. Added ' + num(tally.added) +
                ', already in the system ' + num(tally.exists) + ', not saved ' + num(tally.failed) + '.';
        }, 120);
    }

    window.addEventListener('beforeunload', function (event) {
        if (importing) { event.preventDefault(); event.returnValue = ''; }
    });

    $('imp-start').addEventListener('click', async function () {
        const todo = rows.filter(r => r.status === 'ready');
        if (!todo.length || importing) return;
        dept = $('imp-dept').value.trim();
        message('');
        importing = true;
        cancelled = false;
        show('imp-pick', false);
        show('imp-preview', false);
        show('imp-done', false);
        show('imp-run', true);
        $('imp-cancel').disabled = false;
        $('imp-run').scrollIntoView({ block: 'start' });

        const tally = { added: 0, exists: 0, failed: 0 };
        let next = 0, lostConnection = 0, signedOut = false, stopReason = '';
        updateProgress(todo.length, tally);
        try { await api.getSession(); }                    // fresh CSRF token
        catch (error) {
            importing = false;
            if (authFail(error)) return;
            show('imp-run', false); show('imp-pick', true); show('imp-preview', true);
            message(error.message, true);
            return;
        }

        async function lane() {
            while (!cancelled) {
                const i = next++;
                if (i >= todo.length) return;
                const r = todo[i];
                try {
                    const body = { id: r.id, lastName: r.lastName, firstName: r.firstName, middleName: r.middleName,
                        gender: r.gender, course: r.course, year: r.year, category: 'student' };
                    // The department is taken from the course. The typed department is only used when the course is not recognised.
                    const department = (window.SLCDepartments && window.SLCDepartments.forCourse(r.course)) || dept;
                    if (department) body.college = department;
                    await api.request('/api/patients', { method: 'POST', body: body });
                    r.status = 'added'; existingIds.add(r.id.toLowerCase()); tally.added++; lostConnection = 0;
                } catch (error) {
                    if (error.status === 401) { signedOut = true; cancelled = true; return; }
                    if (error.status === 409) { r.status = 'exists'; r.note = 'Already enrolled this school year'; tally.exists++; lostConnection = 0; }
                    else {
                        r.status = 'failed'; r.note = error.message; tally.failed++;
                        if (error.status === undefined && ++lostConnection >= 5) {
                            cancelled = true;
                            stopReason = 'The connection to the clinic server was lost, so the import stopped.';
                        } else if (error.status !== undefined) lostConnection = 0;
                    }
                }
                updateProgress(todo.length, tally);
            }
        }
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, todo.length) }, lane));
        importing = false;
        if (signedOut) { window.location.assign('/index.html'); return; }
        finish(todo, tally, stopReason);
    });

    $('imp-cancel').addEventListener('click', function () {
        cancelled = true;
        this.disabled = true;
        $('imp-progress-text').textContent = 'Stopping after the students already being saved...';
    });

    function finish(todo, tally, stopReason) {
        const left = todo.filter(r => r.status === 'ready');
        left.forEach(function (r) { r.status = 'notdone'; });
        show('imp-run', false);
        $('imp-done-counts').innerHTML = countBoxes([
            ['Added', tally.added, 'ok'],
            ['Already enrolled this school year', count(['exists']), 'wn'],
            ['Not saved or skipped', count(['problem', 'failed']), 'er'],
            ['Not processed', left.length, '']
        ]);
        const notAdded = rows.filter(r => r.status !== 'added').length;
        $('imp-done-note').textContent = (stopReason ? stopReason + ' ' : (left.length ? 'The import was cancelled. ' : '')) +
            (left.length ? 'Importing the same file again adds only the students that are still missing. ' : '') +
            (notAdded ? 'The table below lists every row, with the ones that were not added under Problems, Already enrolled or Not processed.' : 'Every student in the file was added.');
        $('imp-download').hidden = !notAdded;
        $('imp-done-title').textContent = left.length ? 'Import stopped' : 'Import finished';
        $('imp-preview-title').textContent = 'Result by row';
        $('imp-counts').innerHTML = '';
        $('imp-file-info').textContent = fileName + '. ' + sheetInfo;
        show('imp-actions', false);
        if (count(['problem', 'failed'])) filter = 'bad';
        else if (left.length) filter = 'notdone';
        else if (count(['exists'])) filter = 'exists';
        else filter = 'added';
        renderTabs();
        renderTable();
        show('imp-done', true);
        show('imp-preview', true);
        $('imp-done').scrollIntoView({ block: 'start' });
        $('imp-done').focus();
        if (tally.added) window.dispatchEvent(new CustomEvent('students:changed'));   // refresh the list behind the window
    }

    /* ---------- download the rows that were not added ---------- */
    function csvCell(value) {
        let text = String(value == null ? '' : value);
        if (/^[=+@\t\r]/.test(text)) text = "'" + text;      // stop Excel from running a cell as a formula
        return '"' + text.replace(/"/g, '""') + '"';
    }
    $('imp-download').addEventListener('click', function () {
        const lines = [['Row', 'Code', 'Last Name', 'First Name', 'Middle Name', 'Sex', 'Course', 'Year', 'Reason'].map(csvCell).join(',')];
        rows.filter(r => r.status !== 'added').forEach(function (r) {
            const reason = r.status === 'notdone' ? 'Not processed (import stopped)' : r.note || '';
            lines.push([r.row, r.id, r.lastName, r.firstName, r.middleName, r.gender, r.course, r.year, reason].map(csvCell).join(','));
        });
        // The BOM makes Excel read names such as "Peña" correctly.
        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'students-not-added.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
})();