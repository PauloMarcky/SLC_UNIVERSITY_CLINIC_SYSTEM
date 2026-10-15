/* UI regression checks against a temporary static server and synthetic API responses.
   Never connects to MySQL. Install Playwright in a test-tools directory, then run:
   node tests/frontend-ui.cjs
   Optional: PLAYWRIGHT_MODULE=<absolute playwright path>, UI_SCREENSHOTS=<output directory>.
   Uses installed Microsoft Edge; no browser or runtime dependencies added to the portal. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'doctor/queue.html', 'doctor/checkup.html', 'doctor/consultation.html',
    'doctor/screening.html', 'doctor/statistics.html', 'doctor/statistics-checkup.html',
    'doctor/statistics-consultation.html', 'doctor/users.html', 'nurse/medical-records.html',
    'nurse/record-detail.html', 'nurse/add-student.html', 'nurse/assess.html',
    'archive/clinic-dashboard.html', 'archive/records.html', 'archive/reports.html'];
const patient = { id: 'UI-TEST-001', name: 'UI Test Patient', college: 'IT', course: 'BSIT', year: '3', category: 'student' };
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
let role = 'doctor', failLogin = false, loginPayload, lastVisitQuery, visitPayload, visitCsrf;
const unexpectedApiRequests = [];
async function mockApi(route) {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/login') {
        loginPayload = route.request().postDataJSON();
        if (failLogin) return route.fulfill({ status: 401, json: { error: 'Invalid test credentials.' } });
        body = { user: { role, name: 'UI Test User' } };
    } else if (url.pathname === '/api/session') body = { user: { role, name: 'UI Test User' }, csrfToken: 'ui-test-only' };
    else if (url.pathname === '/api/notifications') body = { notifications: [] };
    else if (url.pathname === '/api/visits/queue' || url.pathname === '/api/visits/screened') body = { visits: [] };
    else if (url.pathname === '/api/patients') body = { patients: [patient] };
    else if (url.pathname === '/api/visits') {
        lastVisitQuery = url.search;
        if (route.request().method() === 'POST') {
            visitPayload = route.request().postDataJSON();
            visitCsrf = route.request().headers()['x-csrf-token'];
        }
        body = { visits: [] };
    }
    else if (url.pathname === '/api/medicines') body = { medicines: [] };
    else if (url.pathname === '/api/users') body = { users: [] };
    else if (url.pathname === '/api/config') body = { universityName: 'UI Test University', clinicName: 'UI Test Clinic' };
    else if (url.pathname !== '/api/logout') {
        unexpectedApiRequests.push(route.request().method() + ' ' + url.pathname);
        return route.fulfill({ status: 500, json: { error: 'Unrecognized UI test route' } });
    }
    await route.fulfill({ status: 200, json: body });
}
const server = http.createServer(async (req, res) => {
    try {
        const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        const bytes = await fs.readFile(file);
        res.writeHead(200, { 'Content-Type': (contentTypes[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
        res.end(bytes);
    } catch { res.writeHead(404).end(); }
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    await context.route('**/api/**', mockApi);
    const page = await context.newPage();
    const errors = [], failures = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => { if (response.status() === 404 && !response.url().endsWith('favicon.ico')) failures.push(response.url()); });
    try {
        if (process.env.UI_SCREENSHOTS) await fs.mkdir(process.env.UI_SCREENSHOTS, { recursive: true });
        let layouts = 0;
        for (const theme of ['light', 'dark']) {
            for (const width of [1440, 820, 390, 320]) {
                await page.setViewportSize({ width, height: 900 });
                for (const file of pages) {
                    role = file.startsWith('nurse/') ? 'nurse' : 'doctor';
                    await page.goto(base + '/' + file);
                    await page.evaluate(theme => window.ClinicTheme.set(theme), theme);
                    await page.waitForTimeout(240);
                    const result = await page.evaluate(() => {
                        const sidebar = document.querySelector('aside');
                        return {
                            overflow: document.documentElement.scrollWidth > innerWidth + 1,
                            theme: document.documentElement.dataset.theme,
                            switches: document.querySelectorAll('[data-theme-choice]').length,
                            sidebar: sidebar && Math.round(sidebar.getBoundingClientRect().width),
                            sidebarHidden: sidebar && getComputedStyle(sidebar).visibility === 'hidden',
                            logoFilter: sidebar && getComputedStyle(sidebar.querySelector('.clinic-sidebar-brand img')).filter,
                            headerHeight: (() => { const topbar = document.querySelector('.topbar'); return topbar && Math.round(topbar.getBoundingClientRect().height); })(),
                            formActionPosition: (() => { const actions = document.querySelector('.form-actions'); return actions && getComputedStyle(actions).position; })(),
                            images: Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
                            tables: document.querySelectorAll('table').length,
                            wrappedTables: document.querySelectorAll('.table-scroll table').length,
                            headerOverlap: (() => {
                                const children = Array.from(document.querySelectorAll('.topbar > *'))
                                    .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
                                return children.some((a, index) => children.slice(index + 1).some(b =>
                                    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                                    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
                            })()
                        };
                    });
                    assert.equal(result.overflow, false, `${file}, ${width}, ${theme}: document overflows`);
                    assert.equal(result.headerOverlap, false, `${file}, ${width}, ${theme}: header controls overlap`);
                    assert.equal(result.theme, theme);
                    assert.equal(result.switches, 2, `${file}: theme controls missing`);
                    assert.equal(result.images.length, 0, `${file}: missing image ${result.images}`);
                    assert.equal(result.tables, result.wrappedTables, `${file}: table without scroll region`);
                    if (file !== 'index.html') {
                        assert.match(result.logoFilter, /invert\(1\)/, `${file}: sidebar seal is not white`);
                        if (width > 900) {
                            assert.equal(result.sidebar, 280, `${file}: shared desktop sidebar width`);
                            assert.equal(result.headerHeight, 82, `${file}: shared desktop header height`);
                        } else {
                            assert.equal(result.sidebarHidden, true, `${file}, ${width}: navigation drawer should start closed`);
                            assert.equal(result.headerHeight, 72, `${file}: shared tablet/mobile header height`);
                        }
                    }
                    if (file === 'nurse/add-student.html') assert.equal(result.formActionPosition, 'static', 'form actions should not cover fields while scrolling');
                    if (process.env.UI_SCREENSHOTS && theme === 'light' && [1440, 390].includes(width)) {
                        await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, `${file.replaceAll('/', '-')}-${theme}-${width}.png`), fullPage: true });
                    }
                    layouts++;
                }
                console.log(`PASS ${theme} ${width}px: all ${pages.length} pages`);
            }
        }
        role = 'doctor';
        await page.setViewportSize({ width: 820, height: 900 });
        await page.goto(base + '/doctor/queue.html');
        await page.waitForFunction(() => document.querySelector('aside .nav-group summary'));
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
        assert.ok(await page.locator('aside .nav-group summary').first().evaluate(el => {
            const height = Math.round(el.getBoundingClientRect().height);
            return height >= 48 && height <= 68;
        }), 'wrapped Doctor navigation labels should grow without clipping');
        assert.equal(await page.locator('aside .nav-group .nav-children a').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)), 14);
        role = 'nurse';
        await page.setViewportSize({ width: 1672, height: 941 });
        await page.goto(base + '/doctor/statistics.html');
        await page.evaluate(() => window.ClinicTheme.set('light'));
        await page.waitForFunction(() => document.querySelector('aside h4')?.textContent === 'Nurse');
        await page.waitForTimeout(240);
        assert.equal(await page.locator('aside').evaluate(el => Math.round(el.getBoundingClientRect().width)), 280);
        assert.deepEqual(await page.locator('aside nav a').allTextContents(), ['Assess', 'Statistics', 'Log out']);
        assert.equal(await page.locator('.topbar h1').textContent(), 'Statistics');
        assert.match(await page.locator('.clinic-sidebar-brand img').evaluate(el => getComputedStyle(el).filter), /invert\(1\)/);
        assert.equal(await page.locator('.alert-title').textContent(), 'Possible outbreak pattern (sample data)');
        assert.deepEqual(await page.locator('.alert-message strong').allTextContents(), ['11 → 20', '3 → 6']);
        await page.locator('#stat-period').selectOption('week');
        assert.match(await page.locator('#stat-summary').textContent(), /This week/);
        await page.locator('#stat-reset').click();
        assert.match(await page.locator('#stat-summary').textContent(), /97 cases.*This month/);
        if (process.env.UI_SCREENSHOTS) {
            await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, 'nurse-statistics-reference-1672x941.png') });
        }
        // Theme survives navigation and reload; old saved choices are still supported.
        await page.goto(base + '/index.html');
        await page.locator('[data-theme-choice="dark"]').click();
        await page.goto(base + '/doctor/queue.html');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        // Mobile drawer is usable, modal to keyboard navigation, and closes on Escape.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + '/doctor/queue.html');
        await page.locator('.menu-toggle').click();
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('main').evaluate(el => el.inert), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('main').evaluate(el => el.inert), false);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('.menu-toggle').click();
        await page.waitForTimeout(240);
        assert.equal(await page.locator('main').evaluate(el => Math.round(el.getBoundingClientRect().left)), 0);
        // Browser mocks validate the original login payload, error message and all role routes.
        failLogin = true;
        await page.goto(base + '/index.html');
        await page.locator('#u').fill('ui-test'); await page.locator('#p').fill('ui-test-password');
        await page.locator('#password-toggle').click();
        assert.equal(await page.locator('#p').getAttribute('type'), 'text');
        await page.locator('.login-submit').click();
        await page.locator('#login-message:not([hidden])').waitFor();
        assert.match(await page.locator('#login-message').textContent(), /Invalid test credentials/);
        failLogin = false;
        for (const nextRole of ['doctor', 'nurse']) {
            role = nextRole;
            await page.goto(base + '/index.html');
            await page.locator(`[data-role="${role}"]`).click();
            await page.locator('#u').fill('ui-test'); await page.locator('#p').fill('ui-test-password');
            await Promise.all([page.waitForURL(`**/${role === 'doctor' ? 'doctor/queue' : 'nurse/assess'}.html`), page.locator('.login-submit').click()]);
            assert.deepEqual(loginPayload, { username: 'ui-test', password: 'ui-test-password', portal: role });
        }
        // Reduced-motion users see no flock; normal mode spawns after roughly seven seconds.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(base + '/index.html');
        await page.clock.install();
        await page.clock.fastForward(7200);
        assert.equal(await page.locator('.bird-flight').count(), 0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.waitForTimeout(100);
        await page.clock.fastForward(7200);
        assert.ok(await page.locator('.bird-flight').count() >= 2);
        assert.deepEqual(errors, [], 'Browser JavaScript errors');
        assert.deepEqual(failures, [], 'Missing assets');
        assert.deepEqual(unexpectedApiRequests, [], 'Unexpected API requests');
        console.log(`PASS ${layouts} page/theme/viewport combinations; theme persistence, sidebar, mobile drawer, two login routes, password control, login errors, and reduced motion.`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
