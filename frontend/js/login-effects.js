/* Decorative flocks. Timers and animation stop in hidden/reduced-motion pages. */
(function () {
    'use strict';
    var scene = document.querySelector('.login-birds');
    if (!scene) return;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timer = null;
    function flock() {
        if (document.hidden || reducedMotion.matches) return;
        var count = 2 + Math.floor(Math.random() * 2);
        var sky = 17 + Math.random() * 5;
        var bounds = scene.getBoundingClientRect();
        for (var i = 0; i < count; i += 1) {
            var bird = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            bird.setAttribute('viewBox', '0 0 32 16');
            bird.setAttribute('class', 'bird-flight');
            bird.setAttribute('aria-hidden', 'true');
            bird.innerHTML = '<path d="M2 10 Q8 2 16 10 Q23 2 30 10 Q22 6 16 13 Q9 6 2 10Z" fill="currentColor"/>';
            bird.style.setProperty('--bird-top', (sky + i * 1.4) + '%');
            bird.style.setProperty('--bird-duration', (10 + Math.random() * 3) + 's');
            bird.style.setProperty('--bird-delay', (i * 0.55) + 's');
            bird.style.setProperty('--bird-drift', (-bounds.height * (0.01 + Math.random() * 0.02)) + 'px');
            bird.style.setProperty('--bird-mid', (bounds.width * 0.2) + 'px');
            bird.style.setProperty('--bird-distance', (bounds.width * 0.44) + 'px');
            bird.style.setProperty('--bird-size', (13 + Math.random() * 6) + 'px');
            bird.addEventListener('animationend', function (event) {
                if (event.target === event.currentTarget) event.currentTarget.remove();
            });
            scene.append(bird);
        }
    }
    function stop() {
        window.clearInterval(timer);
        timer = null;
        scene.replaceChildren();
    }
    function sync() {
        stop();
        if (document.hidden || reducedMotion.matches) return;
        timer = window.setInterval(flock, 7000);
    }
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', sync);
    sync();
})();
