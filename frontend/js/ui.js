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
        // Two buttons share one menu: a close button inside the sidebar, and a hamburger
        // (header, or above the content on pages without a header) that shows only while the menu is hidden.
        var icon = function (d) {
            return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
        };
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'menu-toggle menu-open';
        toggle.innerHTML = icon('M4 7h16M4 12h16M4 17h16');
        toggle.setAttribute('aria-controls', sidebar.id);
        toggle.setAttribute('aria-label', 'Show menu');
        toggle.title = 'Show menu';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'menu-toggle menu-close';
        closeBtn.innerHTML = icon('M15 6l-6 6 6 6') + '<span>Hide menu</span>';
        closeBtn.setAttribute('aria-controls', sidebar.id);
        closeBtn.setAttribute('aria-label', 'Hide menu');
        closeBtn.title = 'Hide menu';
        var mobile = window.matchMedia('(max-width: 760px)');
        function setExpanded(expanded) {
            shell.classList.toggle('sidebar-collapsed', !expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            closeBtn.setAttribute('aria-expanded', String(expanded));
            toggle.hidden = expanded;
            document.body.classList.toggle('drawer-open', expanded && mobile.matches);
        }
        setExpanded(!mobile.matches);
        toggle.addEventListener('click', function () { setExpanded(true); closeBtn.focus(); });
        closeBtn.addEventListener('click', function () { setExpanded(false); toggle.focus(); });
        mobile.addEventListener('change', function () { setExpanded(!mobile.matches); });
        // Phones: the menu is a drawer. Tapping the dimmed area (the shell itself) or pressing Escape closes it.
        shell.addEventListener('click', function (e) { if (mobile.matches && e.target === shell) { setExpanded(false); toggle.focus(); } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mobile.matches && !shell.classList.contains('sidebar-collapsed')) { setExpanded(false); toggle.focus(); } });
        // Brand block (seal + name) at the top of the sidebar. The top bar is hidden on desktop by CSS and still shows on phones.
        if (document.querySelector('.topbar') && !sidebar.querySelector('.sidebar-brand')) {
            var brand = document.createElement('div');
            brand.className = 'sidebar-brand';
            brand.title = 'University of La Salette, Santiago City - Clinic Management System';
            brand.innerHTML = '<span class="brand-seal" aria-hidden="true"></span><span class="brand-text"><span class="brand-name">University of La Salette</span><span class="brand-sub">Clinic Management System</span></span>';
            sidebar.classList.add('has-brand');
            sidebar.prepend(brand);
        }
        var headerBar = document.querySelector('.topbar');
        if (headerBar) { headerBar.prepend(toggle); } else { main.prepend(toggle); }
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
        // Log out sits at the bottom of the sidebar, outside the menu <nav> that role-nav.js rebuilds.
        var logoutLink = document.querySelector('.topbar a[data-logout]');
        if (logoutLink && !sidebar.querySelector('[data-logout]')) {
            var accountNav = logoutLink.closest('nav');
            var logoutSlot = document.createElement('div');
            logoutSlot.className = 'sidebar-logout';
            logoutSlot.append(closeBtn, logoutLink);
            sidebar.append(logoutSlot);
            if (accountNav && !accountNav.querySelector('a')) accountNav.remove();
        }
        if (!closeBtn.parentNode) sidebar.append(closeBtn);
        decorateNav(sidebar);
        window.ClinicUI = { decorateNav: decorateNav };
    }
    // Whole-row click: a table row that has a link (or a View/Review button) opens it when clicked anywhere on the row.
    // Works for rows built later by scripts too. Rows with nowhere to go (hidden patients, stock lists) stay plain.
    function rowTarget(row) {
        return row.querySelector('a[href]:not([data-logout])') || row.querySelector('.certificate-actions button:not(:disabled)');
    }
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.target.closest('a,button,input,select,textarea,label,summary,[role="button"]')) return;
        var row = e.target.closest('tbody tr');
        var target = row && rowTarget(row);
        if (!target) return;
        if (window.getSelection && String(window.getSelection())) return; // user is selecting text, not clicking
        if (target.tagName === 'A' && (e.ctrlKey || e.metaKey || e.shiftKey)) { window.open(target.href, '_blank'); return; }
        target.click();
    });
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