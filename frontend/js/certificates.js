(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const api = window.ClinicAPI;
    let user, records = [], patients = [], editing = null, reviewing = null, dirty = false, busy = false;
    let patientSearchTimer, patientSearchSequence = 0;
    const editable = certificate => user.role === 'nurse' && ['Draft', 'Returned for Revision'].includes(certificate.status);
    function node(tag, text, className) {
        const result = document.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    }
    function date(value) {
        if (!value) return '—';
        return new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString(undefined,
            value.length === 10 ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' });
    }
    function message(text, error = false) {
        $('certificate-message').textContent = text;
        $('certificate-message').classList.toggle('error', error);
        $('certificate-message').hidden = !text;
        if (error) $('certificate-message').focus();
    }
    async function act(task) {
        if (busy) return;
        busy = true;
        const buttons = [...document.querySelectorAll('main button')];
        const disabled = buttons.map(button => button.disabled);
        buttons.forEach(button => { button.disabled = true; });
        try { await task(); }
        catch (error) {
            if (error.status === 401) {
                dirty = false;
                window.location.assign('/index.html');
            } else message(error.message + (error.status === 409 ? ' Your unsaved edits have been kept. Close this form and reopen the record to load its latest status.' : ''), true);
        } finally {
            buttons.forEach((button, i) => { button.disabled = disabled[i]; });
            busy = false;
        }
    }
    function button(text, action, secondary = true) {
        const result = node('button', text, secondary ? 'btn sec' : 'btn');
        result.type = 'button';
        result.addEventListener('click', () => act(action));
        return result;
    }
    function badge(status) {
        const color = { Draft: 'purple', 'Pending Approval': 'yellow', 'Returned for Revision': 'red', Approved: 'green' }[status];
        return node('span', status, 'pill ' + (color || ''));
    }
    function printButton(certificate) {
        const link = node('a', 'Print Certificate', 'btn');
        link.href = '/certificates/' + encodeURIComponent(certificate.id) + '/print';
        link.target = '_blank';
        link.rel = 'noopener';
        return link;
    }
    function renderRows() {
        document.querySelectorAll('[data-count]').forEach(item => {
            item.textContent = records.filter(c => c.status === item.dataset.count).length;
        });
        const search = $('certificate-search').value.trim().toLowerCase();
        const status = $('certificate-filter').value;
        const filtered = records.filter(c => (!status || c.status === status) &&
            (c.patientName + ' ' + c.patientId).toLowerCase().includes(search));
        $('certificate-rows').replaceChildren();
        if (!filtered.length) {
            const row = node('tr'), cell = node('td', 'No certificates match. Nurses can create a certificate to get started.', 'certificate-empty');
            cell.colSpan = 5; row.append(cell); $('certificate-rows').append(row);
        }
        filtered.forEach(c => {
            const row = node('tr');
            const patient = node('td', c.patientName); patient.append(node('div', c.patientId, 'certificate-patient-summary'));
            row.append(patient, node('td', c.type), node('td', date(c.submittedAt || c.createdAt)));
            const statusCell = node('td'); statusCell.append(badge(c.status)); row.append(statusCell);
            const actions = node('td'), group = node('div', undefined, 'certificate-actions');
            group.append(button(user.role === 'doctor' && c.status === 'Pending Approval' ? 'Review' : 'View', () => openReview(c.id)));
            if (editable(c)) group.append(button('Edit', () => openEditor(c.id)));
            if (c.status === 'Approved') group.append(printButton(c));
            else {
                const lockedPrint = button('Print Certificate', () => {}); lockedPrint.disabled = true;
                lockedPrint.title = 'Available after doctor approval'; group.append(lockedPrint);
            }
            actions.append(group); row.append(actions); $('certificate-rows').append(row);
        });
    }
    async function refresh() {
        const [list, notifications] = await Promise.all([api.request('/api/certificates'), api.request('/api/notifications')]);
        records = list.certificates;
        renderRows();
        renderNotifications(notifications.notifications);
    }
    function renderNotifications(notifications) {
        $('certificate-notifications').replaceChildren();
        if (!notifications.length) $('certificate-notifications').append(node('li', 'No certificate notifications yet.'));
        notifications.forEach(n => {
            const li = node('li'), content = node('div', n.message);
            content.append(node('small', date(n.createdAt) + (n.readAt ? ' · Read' : ' · Unread')));
            li.append(content, button('Open certificate', async () => {
                if (dirty && !window.confirm('Discard your unsaved certificate changes?')) return;
                await openReview(n.certificateId, true);
                if (!n.readAt) await api.request('/api/notifications/' + n.id + '/read', { method: 'POST', body: {} });
                await refresh();
            }));
            $('certificate-notifications').append(li);
        });
    }
    function renderPatients(selected) {
        const search = $('patient-search').value.trim().toLowerCase();
        $('patient-id').replaceChildren(new Option('Select a patient', ''));
        patients.filter(p => p.id === selected || (p.name + ' ' + p.id).toLowerCase().includes(search)).forEach(p => {
            $('patient-id').add(new Option(p.name + ' — ' + p.id, p.id));
        });
        $('patient-id').value = selected || '';
    }
    function patientSummary(patient) {
        return patient ? [patient.id, patient.college, patient.course, patient.year ? 'Year ' + patient.year : ''].filter(Boolean).join(' · ') : 'Select a patient record.';
    }
    function discard() { return !dirty || window.confirm('Discard your unsaved certificate changes?'); }
    function today() {
        const current = new Date();
        return [current.getFullYear(), String(current.getMonth() + 1).padStart(2, '0'), String(current.getDate()).padStart(2, '0')].join('-');
    }
    async function openEditor(id) {
        if (!discard()) return;
        const certificate = id ? (await api.request('/api/certificates/' + id)).certificate : null;
        if (certificate && !editable(certificate)) throw new Error('This certificate is locked. Open its latest details to review its status.');
        editing = certificate;
        dirty = false;
        $('certificate-form').reset();
        $('patient-search').value = '';
        if (certificate?.patient && !patients.some(p => p.id === certificate.patientId)) patients.push(certificate.patient);
        renderPatients(certificate?.patientId);
        if (certificate) {
            ['patientName', 'type', 'certificateDate', 'purpose', 'findings', 'recommendations', 'otherDetails'].forEach(key => {
                $('certificate-form').elements.namedItem(key).value = certificate[key] || '';
            });
        } else $('certificate-date').value = today();
        $('patient-summary').textContent = patientSummary(certificate?.patient || patients.find(p => p.id === certificate?.patientId));
        $('editor-title').textContent = certificate ? 'Edit certificate #' + certificate.id : 'Create certificate';
        $('editor-remarks').hidden = !certificate?.remarks;
        $('editor-remarks').textContent = certificate?.remarks ? 'Doctor’s remarks: ' + certificate.remarks : '';
        $('editor-revision').hidden = !certificate?.revisedFromId;
        $('editor-revision').textContent = certificate?.revisedFromId ? 'Revision of certificate #' + certificate.revisedFromId + '. This draft requires a new doctor approval.' : '';
        $('certificate-review').hidden = true;
        $('certificate-editor').hidden = false;
        $('editor-title').focus();
    }
    function payload() { return Object.fromEntries(new FormData($('certificate-form'))); }
    async function save() {
        if (!$('certificate-form').reportValidity()) return null;
        const body = payload();
        if (editing) body.version = editing.version;
        const response = await api.request('/api/certificates' + (editing ? '/' + editing.id : ''), { method: editing ? 'PUT' : 'POST', body });
        editing = response.certificate;
        dirty = false;
        $('editor-title').textContent = 'Edit certificate #' + editing.id;
        await refresh();
        message('Certificate saved.');
        return editing;
    }
    function preview(certificate) {
        $('certificate-preview').src = '/certificates/' + certificate.id + '/preview';
        $('preview-dialog').showModal();
    }
    function detail(list, label, value) {
        list.append(node('dt', label), node('dd', value || '—'));
    }
    async function openReview(id, discardConfirmed = false) {
        if (!discardConfirmed && !discard()) return;
        const response = await api.request('/api/certificates/' + id);
        const c = response.certificate;
        reviewing = c; dirty = false;
        $('certificate-editor').hidden = true;
        $('certificate-review').hidden = false;
        $('review-title').textContent = 'Certificate #' + c.id + ' · ' + c.patientName;
        const content = $('review-content'); content.replaceChildren(badge(c.status));
        const meta = node('dl', undefined, 'certificate-meta');
        detail(meta, 'Patient record', patientSummary(c.patient || patients.find(p => p.id === c.patientId)));
        detail(meta, 'Patient name on certificate', c.patientName);
        detail(meta, 'Certificate type', c.type); detail(meta, 'Certificate date', date(c.certificateDate));
        detail(meta, 'Created by', c.createdByName + ' · ' + date(c.createdAt));
        detail(meta, 'Last updated by', c.updatedByName ? c.updatedByName + ' · ' + date(c.updatedAt) : '—');
        detail(meta, 'Submitted by', c.submittedByName ? c.submittedByName + ' · ' + date(c.submittedAt) : '—');
        if (c.approvedAt) detail(meta, 'Approved by', c.approvedByName + ' · ' + date(c.approvedAt));
        if (c.revisedFromId) detail(meta, 'Revision of', 'Certificate #' + c.revisedFromId);
        const body = node('dl', undefined, 'certificate-detail');
        detail(body, 'Purpose', c.purpose); detail(body, 'Medical findings', c.findings);
        detail(body, 'Recommendations / period of rest', c.recommendations); detail(body, 'Other details', c.otherDetails);
        content.append(meta, body);
        if (c.remarks) content.append(node('p', 'Doctor’s remarks: ' + c.remarks, 'certificate-remarks'));
        const actions = $('review-actions'); actions.replaceChildren(button('Preview', () => preview(c)));
        if (editable(c)) actions.append(button('Edit', () => openEditor(c.id)));
        $('return-fields').hidden = !(user.role === 'doctor' && c.status === 'Pending Approval');
        $('return-remarks').value = '';
        if (user.role === 'doctor' && c.status === 'Pending Approval') {
            actions.append(button('Approve', () => transition('approve'), false), button('Return for Revision', () => transition('return')));
        }
        if (c.status === 'Approved') {
            actions.append(printButton(c));
            if (user.role === 'nurse') actions.append(button('Create Revision', async () => {
                const response = await api.request('/api/certificates/' + c.id + '/revise', { method: 'POST', body: { version: c.version } });
                await refresh(); await openEditor(response.certificate.id);
                message('A separate revision draft was created. It requires doctor approval before printing.');
            }));
        } else {
            const lockedPrint = button('Print Certificate', () => {}); lockedPrint.disabled = true;
            lockedPrint.title = 'Available after doctor approval'; actions.append(lockedPrint);
        }
        $('certificate-history').replaceChildren();
        (response.history || []).forEach(event => {
            const item = node('li', (event.action || event.event) + ' — ' + (event.actorName || event.userName || 'Clinic staff'));
            item.append(node('small', date(event.createdAt || event.timestamp)));
            if (event.remarks) item.append(node('p', event.remarks));
            $('certificate-history').append(item);
        });
        $('review-title').focus();
    }
    async function transition(action) {
        const remarks = $('return-remarks').value.trim();
        if (action === 'return' && !remarks) { $('return-remarks').focus(); throw new Error('Enter remarks explaining the corrections needed.'); }
        const id = reviewing.id;
        await api.request('/api/certificates/' + id + '/' + action, { method: 'POST', body: { version: reviewing.version, remarks } });
        await refresh(); await openReview(id);
        message(action === 'approve' ? 'Certificate approved. The nurse has been notified and printing is enabled.' : 'Certificate returned for revision. The nurse has been notified.');
    }
    $('certificate-search').addEventListener('input', renderRows);
    $('certificate-filter').addEventListener('change', renderRows);
    $('refresh-certificates').addEventListener('click', () => act(refresh));
    $('create-certificate').addEventListener('click', () => act(() => openEditor(null)));
    $('patient-search').addEventListener('input', () => {
        renderPatients($('patient-id').value);
        clearTimeout(patientSearchTimer);
        const sequence = ++patientSearchSequence;
        patientSearchTimer = setTimeout(async () => {
            try {
                const result = await api.request('/api/patients?search=' + encodeURIComponent($('patient-search').value));
                if (sequence !== patientSearchSequence) return;
                result.patients.forEach(patient => {
                    const index = patients.findIndex(p => p.id === patient.id);
                    if (index < 0) patients.push(patient); else patients[index] = patient;
                });
                renderPatients($('patient-id').value);
            } catch (error) { if (sequence === patientSearchSequence) message(error.message, true); }
        }, 250);
    });
    $('patient-id').addEventListener('change', () => {
        const patient = patients.find(p => p.id === $('patient-id').value);
        $('patient-name').value = patient?.name || '';
        $('patient-summary').textContent = patientSummary(patient);
    });
    $('certificate-form').addEventListener('input', event => { if (event.target.id !== 'patient-search') dirty = true; });
    $('certificate-form').addEventListener('change', event => { if (event.target.id !== 'patient-search') dirty = true; });
    $('certificate-form').addEventListener('submit', event => { event.preventDefault(); act(save); });
    $('preview-draft').addEventListener('click', () => act(async () => { const saved = await save(); if (saved) preview(saved); }));
    $('submit-certificate').addEventListener('click', () => act(async () => {
        if (!$('certificate-purpose').value.trim() || !$('certificate-findings').value.trim()) throw new Error('Enter the purpose and medical findings before submitting for approval.');
        const saved = await save(); if (!saved) return;
        await api.request('/api/certificates/' + saved.id + '/submit', { method: 'POST', body: { version: saved.version } });
        await refresh(); await openReview(saved.id);
        message('Certificate submitted for approval. The doctor has been notified.');
    }));
    $('cancel-edit').addEventListener('click', () => { if (discard()) { dirty = false; $('certificate-editor').hidden = true; } });
    $('close-review').addEventListener('click', () => { $('certificate-review').hidden = true; });
    $('close-preview').addEventListener('click', () => $('preview-dialog').close());
    $('preview-dialog').addEventListener('close', () => { $('certificate-preview').removeAttribute('src'); });
    window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    act(async () => {
        const session = await api.getSession(); user = session.user;
        if (!['nurse', 'doctor'].includes(user.role)) throw new Error('Only clinic nurses and doctors can access certificates.');
        const dashboard = '/' + user.role + '/dashboard.html';
        $('staff-dashboard').href = dashboard; $('sidebar-dashboard').href = dashboard;
        $('staff-role').textContent = user.role === 'doctor' ? 'Doctor' : 'Nurse';
        $('staff-name').textContent = user.name + ' · ' + (user.role === 'doctor' ? 'Review submitted certificates and record your decision.' : 'Prepare, review, and submit certificates for doctor approval.');
        $('create-certificate').hidden = user.role !== 'nurse';
        patients = (await api.request('/api/patients')).patients;
        const status = new URLSearchParams(location.search).get('status');
        if (status) $('certificate-filter').value = status;
        else if (user.role === 'doctor') $('certificate-filter').value = 'Pending Approval';
        await refresh();
        const id = new URLSearchParams(location.search).get('id');
        if (id && /^\d+$/.test(id)) await openReview(id);
    });
    // Refresh notifications and queues without overwriting an open form or review.
    setInterval(() => { if (!busy && !document.hidden && user) act(refresh); }, 30000);
})();
