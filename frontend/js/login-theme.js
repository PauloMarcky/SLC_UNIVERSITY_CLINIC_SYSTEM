/* Shared theme; apply the saved choice before page content is painted. */
(function () {
    'use strict';
    var root = document.documentElement;
    var key = 'clinic-theme';
    // Resolve from this script so root URLs and subdirectory installations both work.
    var loginURL = new URL('../index.html', document.currentScript.src);
    var isLoginPage = location.pathname === loginURL.pathname ||
        location.pathname === new URL('./', loginURL).pathname;
    var theme = 'light';
    try {
        var saved = localStorage.getItem(key) || localStorage.getItem('clinic-login-theme');
        if (isLoginPage && saved === 'dark') theme = 'dark';
    } catch (error) { /* Storage is optional. */ }
    function render() {
        document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
        });
    }
    function apply(next, persist) {
        theme = isLoginPage && next === 'dark' ? 'dark' : 'light';
        root.dataset.theme = theme;
        root.dataset.loginTheme = theme;
        root.style.colorScheme = theme;
        if (persist && isLoginPage) {
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
        // Staff pages stay light and never receive appearance controls.
        if (!isLoginPage) return;
        render();
        document.addEventListener('click', function (event) {
            var button = event.target.closest('[data-theme-choice]');
            if (button) apply(button.dataset.themeChoice, true);
        });
    });
    window.addEventListener('storage', function (event) {
        if (isLoginPage && event.key === key) apply(event.newValue, false);
    });
})();
