/* The clinic system is light only. Every page loads this file so the light theme is set before the page is painted.
   A dark choice saved by the old login switch is ignored and cleared. */
(function () {
    'use strict';
    var root = document.documentElement;
    root.dataset.theme = 'light';
    root.dataset.loginTheme = 'light';
    root.style.colorScheme = 'light';
    try {
        localStorage.removeItem('clinic-theme');
        localStorage.removeItem('clinic-login-theme');
    } catch (error) { /* Storage is optional. */ }
})();