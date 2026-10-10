(function () {
    'use strict';
    let user, loading = false;
    const summary = document.getElementById('dashboard-certificate-summary');
    const notices = document.getElementById('dashboard-certificate-notifications');
    document.querySelectorAll('a[href="index.html"]').forEach(link => { link.dataset.logout = ''; });
    async function refresh() {
        if (loading) return;
        loading = true;
        try {
            if (!user) user = (await ClinicAPI.getSession()).user;
            const [data, alerts] = await Promise.all([ClinicAPI.request('/api/certificates'), ClinicAPI.request('/api/notifications')]);
            const count = status => data.certificates.filter(c => c.status === status).length;
            summary.textContent = user.role === 'doctor' ? count('Pending Approval') + ' certificate request(s) awaiting your review.' :
                count('Draft') + ' draft(s) · ' + count('Returned for Revision') + ' returned for revision · ' + count('Approved') + ' approved and ready to print.';
            const queue = document.getElementById('dashboard-certificate-queue');
            if (queue) {
                queue.replaceChildren();
                const pending = data.certificates.filter(c => c.status === 'Pending Approval');
                if (pending.length) {
                    const region = document.createElement('div'); region.className = 'table-scroll';
                    region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', 'Pending certificate requests');
                    const table = document.createElement('table'), head = document.createElement('thead'), heading = document.createElement('tr'), body = document.createElement('tbody');
                    ['Patient Name', 'Certificate Type', 'Date Requested', 'Status', 'Actions'].forEach(label => {
                        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.append(cell);
                    });
                    head.append(heading);
                    pending.forEach(c => {
                        const row = document.createElement('tr');
                        [c.patientName, c.type, new Date(c.submittedAt).toLocaleDateString(), c.status].forEach(value => {
                            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
                        });
                        const actions = document.createElement('td'), review = document.createElement('a');
                        review.textContent = 'Review'; review.className = 'btn sec'; review.href = 'certificates.html?id=' + encodeURIComponent(c.id);
                        actions.append(review); row.append(actions); body.append(row);
                    });
                    table.append(head, body); region.append(table); queue.append(region);
                }
            }
            notices.replaceChildren();
            alerts.notifications.filter(n => !n.readAt).slice(0, 5).forEach(n => {
                const li = document.createElement('li'), content = document.createElement('div'), link = document.createElement('a');
                content.textContent = n.message;
                link.textContent = 'Open certificate'; link.className = 'btn sec';
                link.href = 'certificates.html?id=' + encodeURIComponent(n.certificateId);
                li.append(content, link); notices.append(li);
            });
        } catch (error) {
            summary.textContent = location.protocol === 'file:' ? 'Start the clinic server with npm start and sign in at http://localhost:3000 to manage certificates.' : error.message;
            if (error.status === 401) window.location.assign('index.html');
        } finally { loading = false; }
    }
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 30000);
})();
