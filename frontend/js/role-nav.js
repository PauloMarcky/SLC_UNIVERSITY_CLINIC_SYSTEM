/* Shows the correct sidebar menu for the logged-in role (nurse or doctor) on pages both roles use.
   Presentation only: the backend still decides who may open what. */
(function () {
    'use strict';
    const MENUS = {
        nurse: {
            title: 'Nurse',
            links: [

                ['Student Records', '../nurse/medical-records.html'],
                ['Statistics', '../doctor/statistics.html']
            ]
        },
        doctor: {
            title: 'Doctor',
            links: [
                ['Queue', '../doctor/queue.html'],
                ['Student Records', '../nurse/medical-records.html'],
                ['Statistics', '../doctor/statistics.html'],
                ['User Management', '../doctor/users.html'],
                ['School Years', '../doctor/school-years.html']
            ],
            order: [['group', 0], ['link', 0], ['link', 1], ['link', 2], ['link', 3], ['link', 4]],
            groups: [
                {
                    title: 'Consultations & Checkups',
                    icon: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16M9 16h6M12 13v6"/>',
                    pages: ['/doctor/screening.html', '/doctor/checkup.html', '/doctor/consultation.html'],
                    links: [
                        ['Screening', '../doctor/screening.html'],
                        ['Checkup', '../doctor/checkup.html'],
                        ['Consultation', '../doctor/consultation.html']
                    ]
                },
                {
                    title: 'Statistics',
                    icon: '<path d="M4 3v17h17M8 16v-4M13 16V8M18 16V5"/>',
                    pages: ['/doctor/statistics-checkup.html', '/doctor/statistics-consultation.html', '/doctor/statistics.html'],
                    links: [
                        ['Statistics for Check up', '../doctor/statistics-checkup.html'],
                        ['Statistics for Consultation', '../doctor/statistics-consultation.html']
                    ]
                }
            ]
        }
    };
    // Pages that are not in the menu highlight the menu item they belong to (per role).
    const PARENT_PAGES = {
        nurse: { '/nurse/record-detail.html': '/nurse/medical-records.html', '/nurse/add-student.html': '/nurse/medical-records.html', '/nurse/import-students.html': '/nurse/medical-records.html' },
        doctor: { '/nurse/record-detail.html': '/nurse/medical-records.html', '/nurse/add-student.html': '/nurse/medical-records.html', '/nurse/import-students.html': '/nurse/medical-records.html' }
    };

    const nav = document.querySelector('aside nav');
    if (!nav || location.protocol === 'file:') return;
    nav.style.visibility = 'hidden'; // avoid a flash of the wrong menu

    function build(role) {
        const menu = MENUS[role];
        const heading = nav.querySelector('h4');
        const logoutLink = nav.querySelector('a[data-logout]');
        nav.querySelectorAll('a:not([data-logout])').forEach(link => link.remove());
        nav.querySelectorAll('.nav-group').forEach(group => group.remove());
        if (heading) heading.textContent = menu.title;
        const current = (PARENT_PAGES[role] || {})[location.pathname] || location.pathname;
        const makeLink = function (item, currentPath) {
            const link = document.createElement('a');
            link.textContent = item[0];
            link.setAttribute('href', item[1]);
            if (new URL(item[1], location.href).pathname === (currentPath || current)) {
                link.classList.add('on');
                link.setAttribute('aria-current', 'page');
            }
            return link;
        };
        const appendGroup = function (group) {
            const details = document.createElement('details');
            details.className = 'nav-group';
            const active = group.pages.includes(current);
            details.open = false;
            if (active) details.classList.add('has-active');
            const summary = document.createElement('summary');
            summary.innerHTML = '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + group.icon + '</svg><span>' + group.title + '</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 10 4 4 4-4"></path></svg>';
            details.append(summary);
            const children = document.createElement('div');
            children.className = 'nav-children';
            group.links.forEach(function (item) { children.append(makeLink(item)); });
            details.append(children);
            nav.append(details);
        };
        if (menu.order) {
            menu.order.forEach(function (entry) {
                if (entry[0] === 'group') appendGroup(menu.groups[entry[1]]);
                else nav.append(makeLink(menu.links[entry[1]]));
            });
        } else {
            menu.links.forEach(function (item) { nav.append(makeLink(item)); });
            (menu.groups || []).forEach(appendGroup);
        }
        if (logoutLink) nav.append(logoutLink);
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
