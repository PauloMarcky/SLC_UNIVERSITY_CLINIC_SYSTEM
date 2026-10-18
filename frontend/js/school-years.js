/* Doctor-only School Years page: add, edit and delete school years.
   Records are sorted into school years by their date, so nothing is copied or lost when a year changes.
   GET /api/school-years, POST /api/school-years, PUT /api/school-years/:id, DELETE /api/school-years/:id */
(function () {
    'use strict';

    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const rows = $('year-rows');
    const form = $('year-form');
    const yearModal = $('year-modal');
    const deleteModal = $('delete-modal');
    let years = [];
    let editing = null;
    let pendingDelete = null;
    let lastFocus = null;

    const format = iso => (window.SchoolYear ? window.SchoolYear.formatDate(iso) : iso) || '';

    function message(text, isError) {
        const node = $('year-message');
        node.textContent = text || '';
        node.hidden = !text;
        node.classList.toggle('user-message-error', Boolean(text && isError));
    }

    function openModal(modal, focusTarget) {
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        if (focusTarget) focusTarget.focus();
    }

    function closeModal(modal) {
        modal.hidden = true;
        if (yearModal.hidden && deleteModal.hidden) document.body.classList.remove('modal-open');
        if (modal === yearModal) { form.reset(); editing = null; $('year-error').hidden = true; }
        if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    }

    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        return td;
    }

    function render() {
        rows.replaceChildren();
        if (!years.length) {
            const tr = document.createElement('tr');
            const td = cell('No school years yet. Use + Add school year to create one.');
            td.colSpan = 6;
            td.className = 'log-placeholder';
            tr.append(td);
            rows.append(tr);
            return;
        }
        years.forEach(year => {
            const tr = document.createElement('tr');
            tr.append(cell(year.label), cell(format(year.startDate)), cell(format(year.endDate)));

            const status = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'pill ' + (year.status === 'current' ? 'green' : 'neutral');
            badge.textContent = year.status === 'current' ? 'Current' : year.status === 'upcoming' ? 'Upcoming' : 'Past';
            status.append(badge);
            tr.append(status);

            tr.append(cell(Number(year.visitCount).toLocaleString('en-US')));

            const actions = document.createElement('td');
            const group = document.createElement('div');
            group.className = 'user-actions';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn sec';
            edit.textContent = 'Edit';
            edit.addEventListener('click', () => openForm(year));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn sec';
            remove.textContent = 'Delete';
            remove.disabled = year.visitCount > 0;
            remove.title = year.visitCount > 0 ? 'A school year with visit records cannot be deleted.' : 'Delete this school year';
            remove.addEventListener('click', () => askDelete(year));
            group.append(edit, remove);
            actions.append(group);
            tr.append(actions);
            rows.append(tr);
        });
    }

    function openForm(year) {
        editing = year || null;
        form.reset();
        $('year-error').hidden = true;
        $('year-modal-title').textContent = year ? 'Edit school year' : 'Add school year';
        $('save-year').textContent = year ? 'Save changes' : 'Add school year';
        $('year-edit-note').hidden = !year;
        if (year) {
            $('year-label').value = year.label;
            $('year-start').value = year.startDate;
            $('year-end').value = year.endDate;
        } else if (years.length) {
            // Suggest the year after the latest one, same dates one year later.
            const last = years[0];
            const next = iso => (Number(iso.slice(0, 4)) + 1) + iso.slice(4);
            $('year-start').value = next(last.startDate);
            $('year-end').value = next(last.endDate);
        }
        openModal(yearModal, $('year-label'));
    }

    function askDelete(year) {
        pendingDelete = year;
        $('delete-copy').textContent = 'Delete school year ' + year.label + ' (' + format(year.startDate) + ' \u2013 ' + format(year.endDate) + ')?';
        openModal(deleteModal, $('confirm-delete'));
    }

    function handleError(error) {
        if (error.status === 401) { window.location.assign('/index.html'); return; }
        message(error.message || 'Unable to complete the school year request.', true);
    }

    async function load() {
        const result = await api.request('/api/school-years');
        years = result.schoolYears;
        render();
    }

    $('add-year').addEventListener('click', () => openForm(null));
    document.querySelectorAll('[data-close-year]').forEach(b => b.addEventListener('click', () => closeModal(yearModal)));
    document.querySelectorAll('[data-close-delete]').forEach(b => b.addEventListener('click', () => { pendingDelete = null; closeModal(deleteModal); }));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('save-year');
        const error = $('year-error');
        error.hidden = true;
        if (!$('year-start').value || !$('year-end').value) {
            error.textContent = 'Enter both the start date and the end date.';
            error.hidden = false;
            return;
        }
        button.disabled = true;
        const body = { label: $('year-label').value.trim(), startDate: $('year-start').value, endDate: $('year-end').value };
        const wasEditing = Boolean(editing);
        try {
            await api.getSession();
            await api.request(wasEditing ? '/api/school-years/' + encodeURIComponent(editing.id) : '/api/school-years', {
                method: wasEditing ? 'PUT' : 'POST',
                body
            });
            closeModal(yearModal);
            message(wasEditing ? 'School year updated.' : 'School year added.');
            await load();
        } catch (err) {
            if (err.status === 401) { window.location.assign('/index.html'); return; }
            error.textContent = err.message;     // stay in the form so the dates can be corrected
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    });

    $('confirm-delete').addEventListener('click', async () => {
        if (!pendingDelete) return;
        const button = $('confirm-delete');
        button.disabled = true;
        try {
            await api.getSession();
            await api.request('/api/school-years/' + encodeURIComponent(pendingDelete.id), { method: 'DELETE' });
            pendingDelete = null;
            closeModal(deleteModal);
            message('School year deleted.');
            await load();
        } catch (error) {
            pendingDelete = null;
            closeModal(deleteModal);
            handleError(error);
        } finally {
            button.disabled = false;
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!deleteModal.hidden) { pendingDelete = null; closeModal(deleteModal); }
        else if (!yearModal.hidden) closeModal(yearModal);
    });

    async function init() {
        try {
            const session = await api.getSession();
            if (session.user.role !== 'doctor') throw new Error('Only a doctor can manage school years.');
            $('add-year').disabled = false;
            await load();
        } catch (error) {
            handleError(error);
        }
    }

    init();
})();
