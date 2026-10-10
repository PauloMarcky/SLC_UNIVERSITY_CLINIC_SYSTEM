(function () {
    'use strict';
    let session = null;
    async function request(path, options = {}) {
        const headers = { Accept: 'application/json', ...options.headers };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (session && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;
        let response;
        try {
            response = await fetch(path, { credentials: 'same-origin', ...options, headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body) });
        } catch (_) { throw new Error('Cannot connect to the clinic server. Check your connection and try again.'); }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(typeof data.error === 'string' ? data.error : 'The request could not be completed. Please try again.');
            error.status = response.status;
            throw error;
        }
        return data;
    }
    async function getSession() {
        session = await request('/api/session');
        return session;
    }
    document.addEventListener('click', async function (event) {
        const link = event.target.closest('[data-logout]');
        if (!link) return;
        if (location.protocol === 'file:') return;
        event.preventDefault();
        try {
            if (!session) await getSession();
            await request('/api/logout', { method: 'POST', body: {} });
            window.location.assign('/index.html');
        } catch (error) {
            if (error.status === 401) window.location.assign('/index.html');
            else window.alert(error.message);
        }
    });
    window.ClinicAPI = { request, getSession };
})();
