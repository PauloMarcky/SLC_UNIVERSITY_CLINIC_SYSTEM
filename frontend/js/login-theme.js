/* Set the saved login appearance before paint; storage may be unavailable on file URLs. */
(function () {
    'use strict';
    var theme = 'light';
    try {
        if (localStorage.getItem('clinic-login-theme') === 'dark') theme = 'dark';
    } catch (error) { /* The toggle still works without persistence. */ }
    document.documentElement.dataset.loginTheme = theme;
    document.addEventListener('DOMContentLoaded', function () {
        var toggle = document.getElementById('theme-toggle');
        function render() {
            var light = document.documentElement.dataset.loginTheme === 'light';
            toggle.setAttribute('aria-pressed', String(light));
            toggle.querySelector('span').textContent = light ? 'Light mode' : 'Dark mode';
        }
        render();
        toggle.addEventListener('click', function () {
            var next = document.documentElement.dataset.loginTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.loginTheme = next;
            try { localStorage.setItem('clinic-login-theme', next); } catch (error) { /* Optional persistence. */ }
            render();
        });
    });
})();
