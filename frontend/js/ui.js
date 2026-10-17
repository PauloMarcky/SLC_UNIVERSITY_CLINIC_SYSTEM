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
            headerTitle.textContent = pageHeading.textContent.trim();
            if (pageHeading.id) headerTitle.id = pageHeading.id;
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
            return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18' + d + '"/></svg>';
        };
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'menu-toggle';
        toggle.setAttribute('aria-controls', sidebar.id);
        var mobile = window.matchMedia('(max-width: 760px)');
        var desktopCollapsed = false;
        try { desktopCollapsed = false; }
        catch (error) { /* Navigation also works without browser storage. */ }
        var tooltip = document.createElement('div');
        tooltip.id = 'clinic-nav-tooltip';
        tooltip.className = 'nav-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        document.body.append(tooltip);
        var tooltipTarget;
        function hideTooltip() {
            tooltip.hidden = true;
            if (tooltipTarget) tooltipTarget.removeAttribute('aria-describedby');
            tooltipTarget = null;
        }
        function showTooltip(target) {
            hideTooltip();
            if (mobile.matches || !shell.classList.contains('sidebar-collapsed') || !target) return;
            tooltipTarget = target;
            tooltip.textContent = target.dataset.navLabel;
            tooltip.hidden = false;
            target.setAttribute('aria-describedby', tooltip.id);
            var bounds = target.getBoundingClientRect();
            tooltip.style.left = (sidebar.getBoundingClientRect().right + 12) + 'px';
            tooltip.style.top = Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8,
                bounds.top + (bounds.height - tooltip.offsetHeight) / 2)) + 'px';
        }
        function setExpanded(expanded, persist) {
            hideTooltip();
            shell.classList.toggle('sidebar-collapsed', !expanded);
            document.body.classList.toggle('sidebar-is-collapsed', !expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            var action = mobile.matches ? (expanded ? 'Close navigation' : 'Open navigation') :
                (expanded ? 'Collapse navigation' : 'Expand navigation');
            toggle.setAttribute('aria-label', action);
            toggle.title = action;
            toggle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="' + (expanded ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16') + '"/></svg><span>' + (expanded ? 'Close menu' : 'Menu') + '</span>';
            document.body.classList.toggle('drawer-open', expanded && mobile.matches);
            sidebar.inert = mobile.matches && !expanded;
            main.inert = expanded && mobile.matches;
            if (persist && !mobile.matches) {
                desktopCollapsed = !expanded;
                try { localStorage.setItem('clinic-sidebar-collapsed', String(desktopCollapsed)); }
                catch (error) { /* Saving a layout preference is optional. */ }
            }
        }
        setExpanded(!mobile.matches && !desktopCollapsed);
        toggle.addEventListener('click', function () {
            var expanded = toggle.getAttribute('aria-expanded') !== 'true';
            setExpanded(expanded, true);
            if (expanded && mobile.matches) sidebar.querySelector('a, button, summary')?.focus();
        });
        mobile.addEventListener('change', function () { setExpanded(!mobile.matches && !desktopCollapsed); });
        // A grouped rail icon opens its full menu, keeping every destination reachable.
        sidebar.addEventListener('click', function (event) {
            var summary = event.target.closest('.nav-group > summary');
            if (summary && !mobile.matches && shell.classList.contains('sidebar-collapsed')) {
                event.preventDefault();
                setExpanded(true, true);
                summary.parentElement.open = true;
            }
        });
        sidebar.addEventListener('click', function (event) {
            var remember = function () {
                var open = Array.from(sidebar.querySelectorAll('.nav-group')).filter(function (g) { return g.open; })
                    .map(function (g) { var s = g.querySelector('summary > span'); return s ? s.textContent.trim() : ''; });
                try { sessionStorage.setItem('clinic-nav-open', JSON.stringify(open)); } catch (error) { /* optional */ }
            };
            if (event.target.closest('.nav-group > summary')) setTimeout(remember, 0);
            else if (event.target.closest('a') && !event.target.closest('.nav-group')) {
                try { sessionStorage.removeItem('clinic-nav-open'); } catch (error) { /* optional */ }
            }
        });
        sidebar.addEventListener('pointerover', function (event) {
            var target = event.target.closest('[data-nav-label]');
            if (target !== tooltipTarget) showTooltip(target);
        });
        sidebar.addEventListener('pointerleave', hideTooltip);
        sidebar.addEventListener('focusin', function (event) { showTooltip(event.target.closest('[data-nav-label]')); });
        sidebar.addEventListener('focusout', hideTooltip);
        sidebar.addEventListener('scroll', hideTooltip, true);
        window.addEventListener('resize', hideTooltip);
        // Phones: tap the dimmed workspace or press Escape to close the navigation drawer.
        shell.addEventListener('click', function (e) {
            if (mobile.matches && e.target === shell && !shell.classList.contains('sidebar-collapsed')) {
                setExpanded(false);
                toggle.focus();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hideTooltip();
            if (e.key === 'Escape' && mobile.matches && !shell.classList.contains('sidebar-collapsed')) {
                setExpanded(false);
                toggle.focus();
            }
            if (e.key === 'Tab' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
                var controls = Array.from(topbar.querySelectorAll('a[href], button:not(:disabled)'))
                    .concat(Array.from(sidebar.querySelectorAll('a[href], button:not(:disabled), summary')))
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
            brand.innerHTML = '<img src="../assets/uls-logo.png" alt="University of La Salette seal" width="602" height="584" onerror="this.remove()"><span>ULS CLINIC<br>MANAGEMENT SYSTEM</span>';
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
        var logout = sidebar.querySelector('a[data-logout]');
        if (logout && !logout.closest('.sidebar-logout')) {
            var logoutNav = document.createElement('nav');
            logoutNav.className = 'sidebar-logout';
            logoutNav.setAttribute('aria-label', 'Session');
            logoutNav.append(logout);
            sidebar.append(logoutNav);
        }
        if (topbar) topbar.prepend(toggle);
        else main.prepend(toggle);
        var paths = {
            dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
            records: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
            certificates: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6m-6 5 2 2 4-4"/>',
            screening: '<path d="M8 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M7 13h3l2-4 2 8 2-4h2"/>',
            checkup: '<path d="M6 3v5a5 5 0 0 0 10 0V3M4 3h4m6 0h4M11 13v3a5 5 0 0 0 10 0v-2"/><circle cx="21" cy="11" r="2"/>',
            consultation: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M8 11h8m-4-4v8"/>',
            visits: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16M9 16h6M12 13v6"/>',
            add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
            inventory: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
            chart: '<path d="M4 3v17h17M8 16v-4M13 16V8M18 16V5"/>',
            users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',
            logout: '<path d="M10 4H4v16h6M9 12h12M17 8l4 4-4 4"/>'
        };
        function decorateNav(aside) {
            aside.querySelectorAll('a').forEach(function (link) {
                var href = link.getAttribute('href');
                var name = link.hasAttribute('data-logout') ? 'logout' : /dashboard/i.test(link.textContent) ? 'dashboard' : /users\.html/.test(href) ? 'users' : /consultation-form/.test(href) ? 'add' : /statistics|reports/.test(href) ? 'chart' : /screening/.test(href) ? 'screening' : /checkup/.test(href) ? 'checkup' : /consultation/.test(href) ? 'consultation' : /certificates/.test(href) ? 'certificates' : /visits/.test(href) ? 'visits' : /inventory/.test(href) ? 'inventory' : 'records';
                if (!link.querySelector('.nav-icon')) {
                    var navIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    navIcon.setAttribute('viewBox', '0 0 24 24');
                    navIcon.setAttribute('class', 'nav-icon');
                    navIcon.setAttribute('aria-hidden', 'true');
                    navIcon.innerHTML = paths[name];
                    link.prepend(navIcon);
                }
                if (!link.querySelector('.nav-label')) {
                    var label = document.createElement('span');
                    label.className = 'nav-label';
                    Array.from(link.childNodes).forEach(function (node) {
                        if (node.nodeType !== 1 || !node.classList.contains('nav-icon')) label.append(node);
                    });
                    link.append(label);
                }
                if (link.classList.contains('on')) link.setAttribute('aria-current', 'page');
            });
            var saved = [];
            try { saved = JSON.parse(sessionStorage.getItem('clinic-nav-open') || '[]'); } catch (error) { /* optional */ }
            aside.querySelectorAll('.nav-group').forEach(function (group) {
                var label = group.querySelector('summary > span');
                if (label) label.classList.add('nav-label');
                if (group.querySelector('a.on, a[aria-current="page"]')) group.classList.add('has-active');
                group.open = group.classList.contains('has-active') || saved.indexOf(label ? label.textContent.trim() : '') >= 0;
                var head = group.querySelector('summary');
                if (head) head.tabIndex = -1;
            });
            aside.querySelectorAll('a, .nav-group > summary').forEach(function (control) {
                var label = control.querySelector('.nav-label');
                var name = (label ? label.textContent : control.textContent).trim();
                control.dataset.navLabel = name;
                control.setAttribute('aria-label', name);
                control.title = name;
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
