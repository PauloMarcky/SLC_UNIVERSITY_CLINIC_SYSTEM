# Frontend regression checks

Shared layout, controls, tables, forms and alerts live in `css/style.css`; the
login, statistics and certificate styles extend that system. `js/login-theme.js`
keeps doctor and nurse workspaces light and preserves the user's separate login
appearance preference. The light/dark buttons remain on `index.html` only.

The login keeps the existing university branding and day/night campus artwork,
with a translucent, blurred card in both themes. Small decorative flocks start
every seven seconds and are disabled while the document is hidden or reduced
motion is requested.

Desktop navigation is 280px wide when expanded and stays visible as an 80px icon
rail when collapsed. Main content and the header follow that width. The desktop
choice is saved as `clinic-sidebar-collapsed`; mobile drawer actions do not change
it. At 760px and below the sidebar remains an off-canvas drawer. Navigation uses
14px labels and 48px controls, with tooltips and accessible names in the icon rail.
Opening a group from the rail expands navigation and reveals its destinations.

## Browser coverage

- 152 combinations: 19 pages, two saved login themes, widths 1440, 820, 390 and
  320 pixels. Staff pages remain light for both saved preferences.
- No document overflow, overlapping header controls, missing images/assets or
  uncaught browser JavaScript errors in those checks.
- 280px expanded sidebar and 80px persistent icon rail, usable icons, consistent
  sidebar control sizing, group expansion through keyboard activation, mobile
  drawer and Escape behavior, keyboard modal handling and scrollable tables.
- Login-only theme controls, translucent blur in both themes, stored preference
  preservation across staff navigation and legacy login preference support.
- Original doctor/nurse login routing/payload, password visibility and errors.
- Consultation BMI calculation, confidential diagnosis behavior, visit submission
  payload/CSRF and search/reset controls.
- Certificate doctor/nurse controls, review display, patient selection and editor.
- 260px desktop sidebar, mobile drawer and Escape behavior, desktop content
  expansion, keyboard modal handling, persistent themes and scrollable tables.
- Two-role (doctor, nurse) login routing/payload, password visibility and login errors.
- Reduced-motion behavior and seven-second decorative animation scheduling.

Browser checks use an ephemeral local static server, installed Microsoft Edge and
synthetic API responses. They do not connect to MySQL or change real clinic data.
Live database-backed login and CRUD are outside this browser suite. Authentication,
routes, permissions and business scripts keep their original behavior. Existing
prototype screens and placeholder actions are not replaced by these UI checks.

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
