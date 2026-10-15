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
    var topbar = document.querySelector('.topbar');
    // Archived staff pages use the same presentation shell, with their original links.
    if (shell && main && !topbar) {
        topbar = document.createElement('header');
        topbar.className = 'topbar';
        topbar.append(document.createElement('h1'));
        document.body.prepend(topbar);
    }
    if (main && topbar) {
        var pageHeading = main.querySelector(':scope > h2, :scope > header > h2, :scope > .page-head h2, :scope > .certificate-heading h2');
        var headerTitle = topbar.querySelector('h1');
        if (pageHeading && headerTitle) {
            var titleCopy = pageHeading.cloneNode(true);
            titleCopy.querySelectorAll('.pill,.badge,[hidden]').forEach(function (item) { item.remove(); });
            headerTitle.textContent = titleCopy.textContent.trim();
            if (pageHeading.id) headerTitle.id = pageHeading.id;
            var statusLabels = Array.from(pageHeading.querySelectorAll(':scope > .pill,:scope > .badge'));
            statusLabels.forEach(function (item) { pageHeading.parentElement.insertBefore(item, pageHeading.nextSibling); });
            pageHeading.remove();
        }
    }
    if (main) {
        main.id = main.id || 'main-content';
        main.tabIndex = -1;
        var skip = document.createElement('a');
        skip.className = 'skip-link';
        skip.href = '#' + main.id;
        skip.textContent = 'Skip to main content';
        document.body.prepend(skip);
    }
    if (shell) {
        var sidebar = shell.querySelector('aside');
        if (!sidebar) return;
        sidebar.id = 'clinic-navigation';
        var icon = function (d) {
            return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
        };
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'menu-toggle';
        toggle.innerHTML = icon('M4 7h16M4 12h16M4 17h16');
        toggle.setAttribute('aria-controls', sidebar.id);
        var mobile = window.matchMedia('(max-width: 900px)');
        function setExpanded(expanded) {
            shell.classList.toggle('sidebar-collapsed', !expanded);
            document.body.classList.toggle('sidebar-is-collapsed', !expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute('aria-label', expanded ? 'Hide navigation' : 'Show navigation');
            toggle.title = expanded ? 'Hide navigation' : 'Show navigation';
            document.body.classList.toggle('drawer-open', expanded && mobile.matches);
            sidebar.inert = !expanded;
            main.inert = expanded && mobile.matches;
        }
        setExpanded(!mobile.matches);
        toggle.addEventListener('click', function () {
            var expanded = toggle.getAttribute('aria-expanded') !== 'true';
            setExpanded(expanded);
            if (expanded && mobile.matches) sidebar.querySelector('a, button')?.focus();
        });
        mobile.addEventListener('change', function () { setExpanded(!mobile.matches); });
        // Phones: tap the dimmed workspace or press Escape to close the navigation drawer.
        shell.addEventListener('click', function (e) {
            if (mobile.matches && e.target === shell && !shell.classList.contains('sidebar-collapsed')) {
                setExpanded(false);
                toggle.focus();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && mobile.matches && !shell.classList.contains('sidebar-collapsed')) {
                setExpanded(false);
                toggle.focus();
            }
            if (e.key === 'Tab' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
                var controls = Array.from(topbar.querySelectorAll('a[href], button:not(:disabled)'))
                    .concat(Array.from(sidebar.querySelectorAll('a[href], button:not(:disabled)')))
                    .filter(function (item) { return item.getClientRects().length && !item.closest('[hidden]'); });
                var first = controls[0], last = controls[controls.length - 1];
                var outside = !controls.includes(document.activeElement);
                if (e.shiftKey && (document.activeElement === first || outside)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && (document.activeElement === last || outside)) { e.preventDefault(); first.focus(); }
            }
        });
        // Keep the ULS seal and system name above the role navigation on every account page.
        if (!sidebar.querySelector('.clinic-sidebar-brand')) {
            var brand = document.createElement('div');
            brand.className = 'clinic-sidebar-brand';
            brand.title = 'University of La Salette, Santiago City - Clinic Management System';
            brand.innerHTML = '<img src="../assets/uls-logo.png" alt="University of La Salette seal" width="602" height="584"><span>ULS CLINIC<br>MANAGEMENT SYSTEM</span>';
            sidebar.prepend(brand);
        }
        var topbarLogout = topbar && topbar.querySelector('a[data-logout]');
        if (topbarLogout) {
            var topbarAccountNav = topbarLogout.closest('nav');
            var menuNav = sidebar.querySelector('nav:not(.sidebar-logout)');
            var sidebarLogout = sidebar.querySelector('a[data-logout]');
            if (menuNav) {
                if (sidebarLogout && sidebarLogout !== topbarLogout) topbarLogout.remove();
                else menuNav.append(topbarLogout);
            }
            if (topbarAccountNav && !topbarAccountNav.querySelector('a')) topbarAccountNav.remove();
        }
        if (topbar) topbar.prepend(toggle);
        else main.prepend(toggle);
        var paths = {
            dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
            records: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
            visits: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16M9 16h6M12 13v6"/>',
            add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
            inventory: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
            chart: '<path d="M4 3v17h17M8 16v-4M13 16V8M18 16V5"/>',
            users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',
            logout: '<path d="M10 4H4v16h6M9 12h12M17 8l4 4-4 4"/>'
        };
        function decorateNav(aside) {
            aside.querySelectorAll('a').forEach(function (link) {
                if (link.querySelector('.nav-icon')) return;
                var href = link.getAttribute('href');
                var name = /dashboard/.test(href) ? 'dashboard' : /users\.html/.test(href) ? 'users' : /consultation-form/.test(href) ? 'add' : /visits/.test(href) ? 'visits' : /inventory/.test(href) ? 'inventory' : /statistics|reports/.test(href) ? 'chart' : /index/.test(href) ? 'logout' : 'records';
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
    function enhanceTable(table, index) {
        if (table.closest('.table-scroll')) return;
        var region = document.createElement('div');
        region.className = 'table-scroll';
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        var heading = table.closest('section') && table.closest('section').querySelector('h3');
        region.setAttribute('aria-label', (heading ? heading.textContent : 'Data table ' + (index + 1)) + ' — scroll horizontally');
        table.before(region);
        region.append(table);
        table.querySelectorAll('th').forEach(function (th) {
            if (!th.hasAttribute('scope')) th.setAttribute('scope', 'col');
        });
    }
    document.querySelectorAll('table').forEach(enhanceTable);
    // Certificate queues are populated asynchronously; give new tables the same scroll region.
    if (main) new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1 || node.classList.contains('table-scroll')) return;
                if (node.matches('table')) enhanceTable(node, 0);
                else node.querySelectorAll('table').forEach(enhanceTable);
            });
        });
    }).observe(main, { childList: true, subtree: true });
    // Keep keyboard focus inside existing custom dialogs without changing their submit logic.
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var dialog = document.querySelector('.modal:not([hidden]) [role="dialog"]');
        if (!dialog) return;
        var items = Array.from(dialog.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'))
            .filter(function (item) { return item.getClientRects().length && !item.closest('[hidden]'); });
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
        }
    });
})();
