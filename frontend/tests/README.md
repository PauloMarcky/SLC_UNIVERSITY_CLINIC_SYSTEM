# Frontend regression checks

The redesign applies to all 15 existing HTML pages. Shared layout, controls, tables,
forms, alerts and light/dark tokens live in `css/style.css`; the login, statistics
and certificate styles extend that system. `js/login-theme.js` is loaded on every
page and preserves the previous login-theme preference.

The login uses `css/docmema-transparent.png`, a background-removed version of the
supplied `css/docmema.png`; the original is retained. Day/night campus artwork
fills the viewport without stretching; portrait screens additionally show the
complete campus panorama above the form. The original source image files are not
edited. Small decorative flocks start every seven seconds and are disabled while
the document is hidden or reduced motion is requested.

All dashboard pages share one viewport-aligned day/night scene and the saved theme.
The entire 16:9 image fits without cropping, with a matching color around it on
other aspect ratios. The 260px desktop sidebar is translucent over that scene;
the mobile drawer paints the same scene at the identical viewport size and offset
so underlying dashboard cards cannot show through. Opening or scrolling navigation
does not resize the scene. Navigation keeps the transparent `assets/uls-logo.png`.

## Verified

- 120 combinations: 15 pages, two themes, widths 1440, 820, 390 and 320 pixels.
- No document overflow, overlapping header controls, missing images/assets or
  uncaught browser JavaScript errors in those checks.
- 260px desktop sidebar, mobile drawer and Escape behavior, desktop content
  expansion, keyboard modal handling, persistent themes and scrollable tables.
- Original four-role login routing/payload, password visibility and login errors.
- Consultation BMI calculation, confidential diagnosis behavior, visit submission
  payload/CSRF and search/reset controls.
- Certificate doctor/nurse controls, review display, patient selection and editor.
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
