/* Shows the correct sidebar menu for the logged-in role (nurse or doctor) on pages both roles use.
   Presentation only: the backend still decides who may open what. */
(function () {
    'use strict';
    const MENUS = {
        nurse: {
            title: 'Nurse',
            links: [
                ['Dashboard', '../nurse/dashboard.html'],
                ['Medical Records', '../nurse/medical-records.html'],
                ['Inventory', '../nurse/inventory.html'],
                ['Statistics', '../doctor/statistics.html'],
                ['Certificates', '../shared/certificates.html']
            ]
        },
        doctor: {
            title: 'Doctor',
            links: [
                ['Dashboard', '../doctor/dashboard.html'],
                ['Consultations & Checkups', '../doctor/visits.html'],
                ['+ New Visit', '../doctor/consultation-form.html'],
                ['Student Records', '../nurse/medical-records.html'],
                ['Certificate Approval', '../shared/certificates.html'],
                ['Statistics', '../doctor/statistics.html']
            ]
        }
    };
    // Pages that are not in the menu highlight the menu item they belong to.
    const PARENT_PAGE = { '/nurse/record-detail.html': '/nurse/medical-records.html' };

    const nav = document.querySelector('aside nav');
    if (!nav || location.protocol === 'file:') return;
    nav.style.visibility = 'hidden'; // avoid a flash of the wrong menu

    function build(role) {
        const menu = MENUS[role];
        const heading = nav.querySelector('h4');
        // certificates.js looks these two elements up by id, so keep the ids when they exist.
        const keepDashboardId = !!document.getElementById('sidebar-dashboard');
        nav.querySelectorAll('a').forEach(link => link.remove());
        if (heading) heading.textContent = menu.title;
        const current = PARENT_PAGE[location.pathname] || location.pathname;
        menu.links.forEach(function (item, index) {
            const link = document.createElement('a');
            link.textContent = item[0];
            link.setAttribute('href', item[1]);
            if (index === 0 && keepDashboardId) link.id = 'sidebar-dashboard';
            if (new URL(item[1], location.href).pathname === current) {
                link.classList.add('on');
                link.setAttribute('aria-current', 'page');
            }
            nav.append(link);
        });
        // ui.js draws the menu icons; ask it to do the same for the new links.
        if (window.ClinicUI && typeof window.ClinicUI.decorateNav === 'function') {
            window.ClinicUI.decorateNav(nav.closest('aside'));
        }
    }

    fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(response => (response.ok ? response.json() : null))
        .then(function (session) {
            const role = session && session.user && session.user.role;
            if (MENUS[role]) build(role); // other roles or no session: leave the page as it is
        })
        .catch(function () { /* server unreachable: leave the original menu */ })
        .finally(function () { nav.style.visibility = ''; });
})();