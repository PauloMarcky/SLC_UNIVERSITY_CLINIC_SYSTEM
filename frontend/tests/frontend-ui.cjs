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
const pages = ['index.html', 'doctor/dashboard.html', 'doctor/visits.html',
    'doctor/screening.html', 'doctor/checkup.html', 'doctor/consultation.html',
    'doctor/consultation-form.html', 'doctor/statistics.html',
    'doctor/statistics-checkup.html', 'doctor/statistics-consultation.html', 'doctor/users.html', 'nurse/dashboard.html',
    'nurse/medical-records.html', 'nurse/record-detail.html', 'nurse/inventory.html',
    'shared/certificates.html',
    'archive/clinic-dashboard.html', 'archive/records.html', 'archive/reports.html'];
const patient = { id: 'UI-TEST-001', name: 'UI Test Patient', college: 'IT', course: 'BSIT', year: '3', category: 'student' };
const certificate = { id: 1, patientId: patient.id, patientName: patient.name, patient,
    type: 'Medical Certificate', status: 'Pending Approval', certificateDate: '2026-10-11',
    createdAt: '2026-10-11T08:00:00Z', submittedAt: '2026-10-11T08:00:00Z', version: 1,
    purpose: 'UI testing', findings: 'Synthetic test content', recommendations: 'Synthetic test content' };
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
    else if (url.pathname === '/api/certificates') body = { certificates: [certificate] };
    else if (url.pathname.startsWith('/api/certificates/')) body = { certificate, history: [] };
    else if (url.pathname === '/api/notifications') body = { notifications: [] };
    else if (url.pathname === '/api/patients') body = { patients: [patient] };
    else if (url.pathname === '/api/users') body = { users: [] };
    else if (url.pathname === '/api/medicines') body = { medicines: [] };
    else if (url.pathname === '/api/prescriptions') body = { prescriptions: [] };
    else if (url.pathname === '/api/visits') {
        lastVisitQuery = url.search;
        if (route.request().method() === 'POST') {
            visitPayload = route.request().postDataJSON();
            visitCsrf = route.request().headers()['x-csrf-token'];
        }
        body = { visits: [] };
    }
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
            await page.goto(base + '/index.html');
            await page.locator(`[data-theme-choice="${theme}"]`).click();
            for (const width of [1440, 820, 390, 320]) {
                await page.setViewportSize({ width, height: 900 });
                for (const file of pages) {
                    role = file.startsWith('nurse/') ? 'nurse' : 'doctor';
                    await page.goto(base + '/' + file);
                    await page.waitForTimeout(240);
                    const result = await page.evaluate(() => {
                        const sidebar = document.querySelector('aside');
                        return {
                            overflow: document.documentElement.scrollWidth > innerWidth + 1,
                            theme: document.documentElement.dataset.theme,
                            switches: document.querySelectorAll('[data-theme-choice]').length,
                            sidebar: sidebar && Math.round(sidebar.getBoundingClientRect().width),
                            images: Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
                            tables: document.querySelectorAll('table').length,
                            wrappedTables: document.querySelectorAll('.table-scroll table').length,
                            glass: (() => {
                                const card = document.querySelector('.login-page .login');
                                if (!card) return null;
                                const style = getComputedStyle(card);
                                return { color: style.backgroundColor, blur: style.backdropFilter || style.webkitBackdropFilter };
                            })(),
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
                    const login = file === 'index.html';
                    assert.equal(result.theme, login ? theme : 'light', `${file}: staff workspace must stay light`);
                    assert.equal(result.switches, login ? 2 : 0, `${file}: theme controls must be login-only`);
                    if (login) {
                        assert.match(result.glass.color, /^rgba\(/, `${theme}: login card must be translucent`);
                        assert.match(result.glass.blur, /blur\(/, `${theme}: login card must blur its background`);
                    }
                    assert.equal(result.images.length, 0, `${file}: missing image ${result.images}`);
                    assert.equal(result.tables, result.wrappedTables, `${file}: table without scroll region`);
                    if (!login && width > 760) assert.equal(result.sidebar, 280, `${file}: sidebar width`);
                    if (process.env.UI_SCREENSHOTS && ['index.html', 'doctor/dashboard.html', 'doctor/users.html', 'nurse/dashboard.html', 'shared/certificates.html', 'doctor/statistics.html'].includes(file) && [1440, 390].includes(width)) {
                        await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, `${file.replaceAll('/', '-')}-${theme}-${width}.png`), fullPage: true });
                    }
                    layouts++;
                }
                console.log(`PASS saved ${theme} theme, ${width}px: all ${pages.length} pages`);
            }
        }
        // A saved login theme survives staff navigation, reload and staff theme API calls.
        await page.goto(base + '/index.html');
        await page.locator('[data-theme-choice="dark"]').click();
        for (const staffRole of ['doctor', 'nurse']) {
            role = staffRole;
            await page.goto(base + `/${staffRole}/dashboard.html`);
            assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
            assert.equal(await page.locator('[data-theme-choice]').count(), 0);
            await page.evaluate(() => window.ClinicTheme.set('dark'));
            assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
            await page.reload();
            assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        }
        await page.goto(base + '/index.html');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.evaluate(() => {
            localStorage.removeItem('clinic-theme');
            localStorage.setItem('clinic-login-theme', 'dark');
        });
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark', 'Legacy login preference is retained');
        // Mobile drawer is usable, modal to keyboard navigation, and closes on Escape.
        role = 'doctor';
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(base + '/doctor/dashboard.html');
        assert.equal(await page.locator('aside').evaluate(el => el.inert), true);
        await page.locator('.menu-toggle').click();
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('main').evaluate(el => el.inert), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('main').evaluate(el => el.inert), false);
        // Desktop collapse keeps an accessible icon rail and persists across staff pages.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(240);
        const navigationSizes = await page.locator('aside a, aside summary').evaluateAll(items => items
            .filter(el => el.getClientRects().length)
            .map(el => ({ name: el.textContent.trim(), font: getComputedStyle(el).fontSize, height: Math.round(el.getBoundingClientRect().height) })));
        for (const item of navigationSizes) {
            assert.equal(item.font, '14px', `${item.name}: consistent sidebar text size`);
            assert.equal(item.height, 48, `${item.name}: consistent sidebar control height`);
        }
        await page.locator('.menu-toggle').click();
        await page.waitForTimeout(240);
        async function assertRail() {
            assert.equal(await page.locator('aside').evaluate(el => Math.round(el.getBoundingClientRect().width)), 80);
            assert.equal(await page.locator('aside').evaluate(el => Math.round(el.getBoundingClientRect().left)), 0);
            assert.equal(await page.locator('aside').evaluate(el => el.inert), false);
            assert.equal(await page.locator('main').evaluate(el => Math.round(el.getBoundingClientRect().left)), 80);
            assert.equal(await page.locator('.topbar').evaluate(el => Math.round(el.getBoundingClientRect().left)), 80);
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
            const controls = await page.locator('aside a, aside summary').evaluateAll(items => items
                .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
                .map(el => ({ icon: !!el.querySelector('.nav-icon'), label: el.getAttribute('aria-label') || el.textContent.trim(), title: el.title })));
            assert.ok(controls.length > 1, 'Collapsed rail has multiple usable destinations');
            for (const control of controls) {
                assert.ok(control.icon, `Rail icon missing: ${control.label}`);
                assert.ok(control.label && control.title, 'Rail controls retain accessible names and tooltips');
            }
        }
        await assertRail();
        assert.equal(await page.evaluate(() => localStorage.getItem('clinic-sidebar-collapsed')), 'true');
        if (process.env.UI_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, 'doctor-collapsed-rail.png'), fullPage: true });
        await page.reload();
        await assertRail();
        await page.locator('aside a[href$="users.html"]').click();
        await page.waitForURL('**/doctor/users.html');
        await assertRail();
        // Opening a collapsed group reveals its destinations, including keyboard activation.
        await page.locator('aside .nav-group summary').first().focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(240);
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('aside .nav-group').first().getAttribute('open'), '');
        assert.equal(await page.locator('aside a[href$="screening.html"]').isVisible(), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('clinic-sidebar-collapsed')), 'false');
        await page.locator('.menu-toggle').click();
        role = 'nurse';
        await page.goto(base + '/nurse/dashboard.html');
        await assertRail();
        if (process.env.UI_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, 'nurse-collapsed-rail.png'), fullPage: true });
        // Mobile drawer changes do not overwrite the saved desktop rail preference.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.menu-toggle').click();
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(240);
        await assertRail();
        await page.locator('.menu-toggle').click();
        role = 'doctor';
        await page.goto(base + '/doctor/dashboard.html');
        // Existing visit modal's focus and dismissal, no clinical record is submitted.
        await page.locator('[data-open-visit]').first().click();
        await page.locator('#visit-modal [data-close-modal]').last().focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#visit-modal .modal-x').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#visit-modal').getAttribute('hidden'), '');
        // Existing BMI and native select handlers remain working.
        await page.goto(base + '/doctor/consultation-form.html');
        await page.locator('#w').fill('65'); await page.locator('#h').fill('170');
        assert.equal(await page.locator('#b').inputValue(), '22.5');
        const mental = await page.locator('#x option').evaluateAll(options => options.find(o => o.value.startsWith('Mental health')).value);
        await page.locator('#x').selectOption(mental);
        assert.equal(await page.locator('#conf').isChecked(), true);
        assert.equal(await page.locator('#conf').isDisabled(), true);
        await page.locator('#pid').fill('UI-NEW-TEST');
        await page.locator('#pname').fill('Synthetic UI Patient');
        await page.locator('#c').fill('Synthetic test reason');
        await page.locator('#bp').fill('120/80');
        role = 'doctor';
        await Promise.all([page.waitForURL('**/doctor/visits.html*'), page.locator('#save-visit').click()]);
        assert.equal(visitPayload.patientId, 'UI-NEW-TEST');
        assert.equal(visitPayload.confidential, true);
        assert.equal(visitCsrf, 'ui-test-only');
        await page.locator('#saved-banner:not([hidden])').waitFor();
        await page.goto(base + '/doctor/visits.html');
        await Promise.all([
            page.waitForResponse(response => response.url().includes('/api/visits?search=UI+test')),
            page.locator('#visit-search').fill('UI test')
        ]);
        assert.ok(lastVisitQuery.includes('search=UI+test'));
        await page.locator('#visit-clear').click();
        assert.equal(await page.locator('#visit-search').inputValue(), '');
        // Existing certificate role controls and editor selects remain accessible.
        role = 'doctor';
        await page.goto(base + '/shared/certificates.html');
        await page.locator('#certificate-rows button').first().waitFor();
        assert.equal(await page.locator('#create-certificate').isVisible(), false);
        await page.locator('#certificate-rows button').first().click();
        await page.locator('#certificate-review:not([hidden])').waitFor();
        assert.match(await page.locator('#review-content').textContent(), /UI Test Patient/);
        role = 'nurse';
        await page.goto(base + '/shared/certificates.html');
        await page.locator('#create-certificate').click();
        await page.locator('#patient-id').selectOption(patient.id);
        assert.equal(await page.locator('#patient-name').inputValue(), patient.name);
        await page.locator('#certificate-type').selectOption('Fitness to Return');
        assert.equal(await page.locator('#certificate-type').inputValue(), 'Fitness to Return');
        if (process.env.UI_SCREENSHOTS) {
            await page.locator('#certificate-type').click();
            await page.screenshot({ path: path.join(process.env.UI_SCREENSHOTS, 'certificate-dropdown-light.png') });
            await page.keyboard.press('Escape');
        }
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#cancel-edit').click();
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
            await Promise.all([page.waitForURL(`**/${role}/dashboard.html`), page.locator('.login-submit').click()]);
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
        console.log(`PASS ${layouts} page/saved-theme/viewport combinations; login glass and theme persistence, light staff workspaces, persistent accessible icon rail, mobile drawer, modal keyboard, BMI, visit form/CSRF, filters, certificate roles/editor, two login routes, password control, login errors, and reduced motion.`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
