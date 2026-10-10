/* Presentation-only enhancements. Existing links, forms and visit logic are untouched. */
(function () {
    'use strict';
    // All portal logout links end the authenticated staff session when served by the clinic backend.
    const logoutLinks = [...document.querySelectorAll('a[href$="index.html"]')]
        .filter(link => /log\s*out/i.test(link.textContent));
    logoutLinks.forEach(link => { link.dataset.logout = ''; });
    if (logoutLinks.length && !document.querySelector('script[src$="clinic-api.js"]')) {
        const apiScript = document.createElement('script');
        apiScript.src = '/js/clinic-api.js';
        document.head.append(apiScript);
    }
    var shell = document.querySelector('.layout, .app');
    var main = document.querySelector('main');
    if (main) {
        main.id = main.id || 'main-content';
        var skip = document.createElement('a');
        skip.className = 'skip-link';
        skip.href = '#' + main.id;
        skip.textContent = 'Skip to main content';
        document.body.prepend(skip);
    }
    if (shell) {
        var sidebar = shell.querySelector('aside');
        sidebar.id = 'clinic-navigation';
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'menu-toggle';
        toggle.setAttribute('aria-controls', sidebar.id);
        var mobile = window.matchMedia('(max-width: 760px)');
        function setExpanded(expanded) {
            shell.classList.toggle('sidebar-collapsed', !expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.textContent = expanded ? 'Hide menu' : 'Show menu';
        }
        setExpanded(!mobile.matches);
        toggle.addEventListener('click', function () {
            setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
        });
        mobile.addEventListener('change', function () { setExpanded(!mobile.matches); });
        main.prepend(toggle);
        var paths = {
            dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
            records: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
            visits: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16M9 16h6M12 13v6"/>',
            add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
            inventory: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
            chart: '<path d="M4 3v17h17M8 16v-4M13 16V8M18 16V5"/>',
            logout: '<path d="M10 4H4v16h6M9 12h12M17 8l4 4-4 4"/>'
        };
        function decorateNav(aside) {
            aside.querySelectorAll('a').forEach(function (link) {
                if (link.querySelector('.nav-icon')) return;
                var href = link.getAttribute('href');
                var name = /dashboard/.test(href) ? 'dashboard' : /consultation-form/.test(href) ? 'add' : /visits/.test(href) ? 'visits' : /inventory/.test(href) ? 'inventory' : /statistics|reports/.test(href) ? 'chart' : /index/.test(href) ? 'logout' : 'records';
                var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('viewBox', '0 0 24 24');
                icon.setAttribute('class', 'nav-icon');
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = paths[name];
                link.prepend(icon);
                if (link.classList.contains('on')) link.setAttribute('aria-current', 'page');
            });
        }
        decorateNav(sidebar);
        window.ClinicUI = { decorateNav: decorateNav };
    }
    document.querySelectorAll('table').forEach(function (table, index) {
        var region = document.createElement('div');
        region.className = 'table-scroll';
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        var heading = table.closest('section') && table.closest('section').querySelector('h3');
        region.setAttribute('aria-label', (heading ? heading.textContent : 'Data table ' + (index + 1)) + ' — scroll horizontally');
        table.before(region);
        region.append(table);
        table.querySelectorAll('th').forEach(function (th) { th.setAttribute('scope', 'col'); });
    });
})();