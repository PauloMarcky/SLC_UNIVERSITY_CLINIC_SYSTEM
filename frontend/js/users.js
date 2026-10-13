/* Doctor-only account management. All reads and writes use the authenticated ClinicAPI. */
(function () {
    'use strict';

    const api = window.ClinicAPI;
    const $ = id => document.getElementById(id);
    const rows = $('user-rows');
    const form = $('user-form');
    const userModal = $('user-modal');
    const deactivateModal = $('deactivate-modal');
    const roleNames = { doctor: 'Doctor', nurse: 'Nurse', student: 'Student', employee: 'Employee (staff)' };
    let currentUser = null;
    let users = [];
    let editingUser = null;
    let pendingDeactivate = null;
    let lastFocus = null;

    function message(text, isError) {
        const node = $('user-message');
        node.textContent = text || '';
        node.hidden = !text;
        node.classList.toggle('user-message-error', Boolean(text && isError));
    }

    function closeModal(modal) {
        modal.hidden = true;
        if (userModal.hidden && deactivateModal.hidden) document.body.classList.remove('modal-open');
        if (modal === userModal) {
            form.reset();
            editingUser = null;
        }
        if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    }

    function openModal(modal, focusTarget) {
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        if (focusTarget) focusTarget.focus();
    }

    function patientRole(role) {
        return role === 'student' || role === 'employee';
    }

    function updatePatientField() {
        const required = patientRole($('user-role').value);
        $('patient-field').hidden = !required;
        $('user-patient-id').required = required;
        if (!required) $('user-patient-id').value = '';
    }

    function setFormMode(user) {
        editingUser = user || null;
        form.reset();
        const editing = Boolean(user);
        const ownAccount = editing && Number(user.id) === Number(currentUser.id);

        $('user-modal-title').textContent = editing ? 'Edit User' : 'Create User';
        $('save-user').textContent = editing ? 'Save Changes' : 'Create User';
        $('username-field').hidden = false;
        $('password-field').hidden = editing;
        $('user-password').required = !editing;
        $('user-username').readOnly = editing;
        $('user-username').required = true;
        $('user-username').value = editing ? user.username : '';
        $('user-name').value = editing ? user.name : '';
        $('user-role').value = editing ? user.role : '';
        $('user-role').disabled = ownAccount;
        $('user-active').checked = editing ? user.active : true;
        $('user-active').disabled = ownAccount;
        $('self-edit-note').hidden = !ownAccount;
        $('user-patient-id').value = editing ? (user.patientId || '') : '';
        updatePatientField();
        openModal(userModal, $('user-name'));
    }

    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        return td;
    }

    function renderUsers() {
        rows.replaceChildren();
        if (!users.length) {
            const tr = document.createElement('tr');
            const td = cell('No users found.');
            td.colSpan = 5;
            td.className = 'log-placeholder';
            tr.append(td);
            rows.append(tr);
            return;
        }

        users.forEach(user => {
            const self = Number(user.id) === Number(currentUser.id);
            const tr = document.createElement('tr');
            const name = cell(user.name);
            if (self) {
                const you = document.createElement('span');
                you.className = 'pill neutral user-self-label';
                you.textContent = 'You';
                name.append(you);
            }
            tr.append(name, cell(user.username), cell(roleNames[user.role] || user.role));

            const status = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'pill ' + (user.active ? 'green' : 'red');
            badge.textContent = user.active ? 'Active' : 'Inactive';
            status.append(badge);
            tr.append(status);

            const actions = document.createElement('td');
            const group = document.createElement('div');
            group.className = 'user-actions';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn sec';
            edit.textContent = 'Edit';
            edit.addEventListener('click', () => setFormMode(user));
            const deactivate = document.createElement('button');
            deactivate.type = 'button';
            deactivate.className = 'btn sec';
            deactivate.textContent = user.active ? 'Deactivate' : 'Inactive';
            deactivate.disabled = self || !user.active;
            deactivate.title = self ? 'You cannot deactivate your own account.' : (user.active ? 'Deactivate this account' : 'This account is already inactive');
            deactivate.addEventListener('click', () => askDeactivate(user));
            group.append(edit, deactivate);
            actions.append(group);
            tr.append(actions);
            rows.append(tr);
        });
    }

    async function loadUsers() {
        const result = await api.request('/api/users');
        users = result.users;
        renderUsers();
    }

    function handleError(error) {
        if (error.status === 401) {
            window.location.assign('/index.html');
            return;
        }
        message(error.message || 'Unable to complete the user management request.', true);
    }

    function askDeactivate(user) {
        pendingDeactivate = user;
        $('deactivate-copy').textContent = 'Deactivate ' + user.name + ' (' + user.username + ')?';
        openModal(deactivateModal, $('confirm-deactivate'));
    }

    $('create-user').addEventListener('click', () => setFormMode(null));
    $('user-role').addEventListener('change', updatePatientField);
    document.querySelectorAll('[data-close-user]').forEach(button => button.addEventListener('click', () => closeModal(userModal)));
    document.querySelectorAll('[data-close-deactivate]').forEach(button => button.addEventListener('click', () => {
        pendingDeactivate = null;
        closeModal(deactivateModal);
    }));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = $('save-user');
        button.disabled = true;
        const body = {
            name: $('user-name').value.trim(),
            role: $('user-role').value,
            active: $('user-active').checked,
            patientId: $('user-patient-id').value.trim()
        };
        const editing = Boolean(editingUser);
        if (editing) body.id = editingUser.id;
        else {
            body.username = $('user-username').value.trim();
            body.password = $('user-password').value;
        }
        try {
            await api.request(editing ? '/api/users/' + encodeURIComponent(editingUser.id) : '/api/users', {
                method: editing ? 'PUT' : 'POST',
                body
            });
            closeModal(userModal);
            message(editing ? 'User updated.' : 'User created.');
            await loadUsers();
        } catch (error) {
            handleError(error);
        } finally {
            button.disabled = false;
        }
    });

    $('confirm-deactivate').addEventListener('click', async () => {
        if (!pendingDeactivate) return;
        const button = $('confirm-deactivate');
        button.disabled = true;
        try {
            await api.request('/api/users/' + encodeURIComponent(pendingDeactivate.id), { method: 'DELETE' });
            pendingDeactivate = null;
            closeModal(deactivateModal);
            message('User account deactivated.');
            await loadUsers();
        } catch (error) {
            handleError(error);
        } finally {
            button.disabled = false;
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!deactivateModal.hidden) {
            pendingDeactivate = null;
            closeModal(deactivateModal);
        } else if (!userModal.hidden) closeModal(userModal);
    });

    async function init() {
        try {
            const session = await api.getSession();
            currentUser = session.user;
            if (currentUser.role !== 'doctor') throw new Error('Only a doctor can manage user accounts.');
            $('create-user').disabled = false;
            await loadUsers();
        } catch (error) {
            handleError(error);
        }
    }

    init();
})();
