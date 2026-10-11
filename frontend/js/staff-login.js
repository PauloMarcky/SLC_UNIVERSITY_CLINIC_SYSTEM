(function () {
    'use strict';

    const subtitle = document.getElementById('login-subtitle');
    const roleLinks = [...document.querySelectorAll('.role-link')];
    const form = document.getElementById('staff-login');
    const message = document.getElementById('login-message');
    const password = document.getElementById('p');
    const passwordToggle = document.getElementById('password-toggle');

    passwordToggle.addEventListener('click', () => {
        const showPassword = password.type === 'password';
        password.type = showPassword ? 'text' : 'password';
        passwordToggle.setAttribute('aria-pressed', String(showPassword));
        passwordToggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
    });

    const PORTALS = {
        doctor: {
            name: 'Doctor',
            subtitle: 'Doctor portal — review and approve medical certificates.',
        },
        nurse: {
            name: 'Nurse',
            subtitle: 'Nurse portal — prepare and manage medical certificates.',
        },
        student: {
            name: 'Student',
            subtitle: 'Student portal — view your clinic status and medical records.',
        },
        employee: {
            name: 'Employee',
            subtitle: 'Employee portal — view your clinic status and medical records.',
        },
    };

    const VALID_ROLES = Object.keys(PORTALS);
    const DEFAULT_SUBTITLE = 'Choose your portal, then enter your credentials.';
    let selectedRole = null;

    function selectRole(role) {
        if (!VALID_ROLES.includes(role)) return clearRole();
        selectedRole = role;
        roleLinks.forEach(link => {
            link.setAttribute('aria-pressed', link.dataset.role === role ? 'true' : 'false');
        });
        subtitle.textContent = PORTALS[role].subtitle;
        if (history.replaceState) {
            history.replaceState(null, '', location.pathname + '?role=' + role);
        }
    }

    function clearRole() {
        selectedRole = null;
        roleLinks.forEach(link => link.setAttribute('aria-pressed', 'false'));
        subtitle.textContent = DEFAULT_SUBTITLE;
        if (history.replaceState) {
            history.replaceState(null, '', location.pathname);
        }
    }

    roleLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (link.dataset.role === selectedRole) clearRole();
            else selectRole(link.dataset.role);
        });
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        message.hidden = true;
        try {
            const data = await ClinicAPI.request('/api/login', {
                method: 'POST',
                body: {
                    username: document.getElementById('u').value.trim(),
                    password: document.getElementById('p').value,
                    portal: selectedRole || undefined,
                },
            });
            const destination = {
                nurse: '/nurse/dashboard.html',
                doctor: '/doctor/dashboard.html',
                student: '/student/dashboard.html',
                employee: '/employee/dashboard.html',
            }[data.user.role] || '/index.html';
            window.location.assign(destination);
        } catch (error) {
            message.textContent = location.protocol === 'file:'
                ? 'Start the clinic server with npm start, then open http://localhost:3000 to sign in.'
                : error.message;
            message.hidden = false;
        } finally {
            button.disabled = false;
        }
    });

    const initialRole = new URLSearchParams(location.search).get('role');
    if (initialRole && VALID_ROLES.includes(initialRole)) selectRole(initialRole);
})();
