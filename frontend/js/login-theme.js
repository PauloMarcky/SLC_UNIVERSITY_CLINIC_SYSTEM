/* Shared theme; apply the saved choice before page content is painted. */
(function () {
    'use strict';
    var root = document.documentElement;
    var key = 'clinic-theme';
    var theme = 'light';
    try {
        var saved = localStorage.getItem(key) || localStorage.getItem('clinic-login-theme');
        if (saved === 'dark') theme = 'dark';
    } catch (error) { /* Storage is optional. */ }
    function render() {
        document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
        });
    }
    function apply(next, persist) {
        theme = next === 'dark' ? 'dark' : 'light';
        root.dataset.theme = theme;
        root.dataset.loginTheme = theme;
        root.style.colorScheme = theme;
        if (persist) {
            try {
                localStorage.setItem(key, theme);
                localStorage.setItem('clinic-login-theme', theme);
            } catch (error) { /* Never block a form when storage is unavailable. */ }
        }
        render();
        window.dispatchEvent(new CustomEvent('clinic:themechange', { detail: { theme: theme } }));
    }
    apply(theme, false);
    window.ClinicTheme = { set: function (next) { apply(next, true); } };
    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.theme-switch')) {
            var host = document.querySelector('.topbar, .app > main > header');
            if (host) {
                var group = document.createElement('div');
                group.className = 'theme-switch';
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', 'Color theme');
                group.innerHTML = '<button type="button" class="theme-option" data-theme-choice="light" aria-label="Light mode" title="Light mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button><button type="button" class="theme-option" data-theme-choice="dark" aria-label="Dark mode" title="Dark mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg></button>';
                host.append(group);
            }
        }
        render();
        document.addEventListener('click', function (event) {
            var button = event.target.closest('[data-theme-choice]');
            if (button) apply(button.dataset.themeChoice, true);
        });
    });
    window.addEventListener('storage', function (event) {
        if (event.key === key) apply(event.newValue, false);
    });
})();
