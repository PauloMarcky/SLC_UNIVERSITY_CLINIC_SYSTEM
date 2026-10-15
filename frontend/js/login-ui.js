/* Login page presentation: show/hide password. Sign-in logic stays in staff-login.js. */
(function () {
    'use strict';
    var input = document.getElementById('p');
    var button = document.getElementById('password-toggle');
    if (!input || !button) return;
    button.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
})();
