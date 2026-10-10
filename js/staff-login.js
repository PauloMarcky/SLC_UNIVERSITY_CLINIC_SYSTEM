(function () {
    'use strict';
    const form = document.getElementById('staff-login');
    const message = document.getElementById('login-message');
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        message.hidden = true;
        try {
            const data = await ClinicAPI.request('/api/login', { method: 'POST', body: {
                username: document.getElementById('u').value.trim(), password: document.getElementById('p').value
            } });
            window.location.assign(data.user.role === 'doctor' ? 'doctor-dashboard.html' : 'nurse-dashboard.html');
        } catch (error) {
            message.textContent = location.protocol === 'file:' ? 'Start the clinic server with npm start, then open http://localhost:3000 to sign in.' : error.message;
            message.hidden = false;
        } finally { button.disabled = false; }
    });
})();
