# Frontend regression checks

The redesign applies to all 16 existing HTML pages. Shared shell, role navigation,
controls, tables, forms, alerts and light/dark tokens live in `css/style.css` and
`js/ui.js`; the login, statistics, prescription and student-record styles extend
that system. `js/login-theme.js` is loaded on every page and preserves the previous
login-theme preference.

The login uses `css/docmema-transparent.png`, a background-removed version of the
supplied `css/docmema.png`; the original is retained. Day/night campus artwork
fills the viewport without stretching; portrait screens additionally show the
complete campus panorama above the form. The original source image files are not
edited. Small decorative flocks start every seven seconds and are disabled while
the document is hidden or reduced motion is requested.

All authenticated and archive pages share a flat pale-blue canvas, white cards,
280px desktop sidebar, 82px header, and dark blue navigation. At 900px and below,
the sidebar opens as a drawer and the header is 72px. The original transparent
`assets/uls-logo.png` is rendered in white across every sidebar without changing
the source seal at `frontend/assets/uls-logo.png`. The login page retains its own
campus artwork.

## Verified

- 128 combinations: 16 pages, two themes, widths 1440, 820, 390 and 320 pixels;
  the nurse Statistics view also has a 1672 x 941 reference-viewport check.
- No document overflow, overlapping header controls, missing images/assets or
  uncaught browser JavaScript errors in those checks.
- 280px shared desktop sidebar, consistent header sizing, white seal treatment,
  tablet/mobile drawer and Escape behavior, Doctor submenu sizing, desktop content
  expansion, keyboard modal handling, persistent themes and scrollable tables.
- Two-role (doctor, nurse) login routing/payload, password visibility and login errors.
- Reduced-motion behavior and seven-second decorative animation scheduling.
- All five existing, database-free certificate template tests pass.
- All frontend JavaScript syntax checks and `git diff --check` pass.

Browser checks use an ephemeral local static server, installed Microsoft Edge and
synthetic API responses. They do not connect to MySQL or change real clinic data.
The checkout had no backend `.env` or installed backend dependencies, so live
database-backed login and CRUD were not verified. Authentication, routes,
permissions, business scripts and backend files were left unchanged. Existing
prototype screens/placeholder actions retain their original behavior.

Native selects retain browser keyboard, validation and form semantics. Browsers
supporting `appearance: base-select` also receive the rounded animated option
picker; other browsers retain their platform picker with themed control styling.

## Run again

Use Node.js and Playwright from a separate test-tools installation. No runtime
dependency was added to the clinic frontend. If Playwright is not resolvable from
this directory, set `PLAYWRIGHT_MODULE` to that installation's absolute module
path. Set `UI_SCREENSHOTS` to an optional output directory for review images.

```powershell
node tests/frontend-ui.cjs
node --test ../backend/tests/certificate-template.test.js
```

Do not run the full backend workflow suite against a real clinic database:
its existing setup resets the configured database.
