# Certificate workflow

The certificate module runs through the included Node.js HTTP server and SQLite database. The previous project consisted of static mock screens; it did not contain a database, passwords, or authenticated user accounts to reuse. The existing patient identifiers and sample records are retained as initial database records. Existing unrelated screens keep their layout and behavior.

## Run locally

Install Node.js 24 or newer. No npm packages or dependency installation are required.

From the project directory, create a nurse and doctor account using their actual display names:

```powershell
npm run create-user -- clinic.nurse nurse "Nurse Full Name"
npm run create-user -- clinic.doctor doctor "Doctor Full Name"
npm start
```

The account command prompts for a password without displaying it. Passwords must have 12–200 characters. No default account or password is installed. Usernames are case insensitive and must be 3–100 letters, numbers, or `.`, `_`, `@`, `-` characters. Approvals use the doctor's stored display name.

Open `http://127.0.0.1:3000` and sign in through the existing portal. The certificate features require the Node server; opening HTML directly or using a static-only preview server will not provide authentication, database operations, or official printing.

For automated provisioning, `CLINIC_USER_PASSWORD` supplies the password; remove it from the environment immediately afterward. Never commit passwords or pass them as command-line arguments.

## Workflow

1. A nurse selects an existing patient and creates a Draft. Patient information fills from the database; the certificate name can be corrected without overwriting the patient record.
2. The nurse edits and saves the draft, previews it, and submits it. A purpose and medical findings are required to submit.
3. Submission locks content, sets Pending Approval, records the submitting account, and notifies active doctors.
4. A doctor reviews the complete certificate and approves it or returns it with required remarks. A returned certificate is editable by nurses and can be resubmitted. The creating and submitting nurses receive the doctor's decision.
5. An Approved certificate is printable by either role. Its content and approval details cannot be changed. “Create Revision” copies it to a separate linked Draft, which must pass the entire approval process before printing. The original approved record remains unchanged.

The doctor dashboard shows the approval queue. The certificate page provides the management table, notifications, full review details, revision remarks, audit history, and role-specific actions. Draft, Pending Approval, and Returned for Revision previews are explicitly unofficial and cannot use the official print route.

The A4 certificate includes clinic/university identification, patient and certificate details, the doctor's stored name, approval date, and a blank area for the doctor's signature. Approval does not fabricate or store a handwritten signature. Printing opens the browser's print interface. Browser-added page headers and footers can be disabled in the print dialog if necessary.

## Data and configuration

The default database is `data/clinic.sqlite`. It contains users, patient records, sessions, certificates, audit snapshots, and notifications. Database files and passwords are ignored by Git. Back up the database using SQLite's backup facilities or stop the server before copying it; do not copy only the main file while writes are occurring in WAL mode.

The initial patient rows match the existing sample interface: Maria Dizon (`2026-00123`), Paolo Reyes (`2025-00456`), Angela Cruz (`2024-00789`), and Jose Ramos (`E-0098`). They are demo records, not an imported live patient registry. Other static patient screens are not a database editor. Import actual clinic patients into the `patients` table before real use; the certificate selector reads that table. Duplicate seed IDs are never overwritten at startup.

| Environment variable | Default / purpose |
| --- | --- |
| `HOST` | `127.0.0.1`; interface to listen on |
| `PORT` | `3000` |
| `CLINIC_DB_PATH` | `data/clinic.sqlite`; use the same path for provisioning and server startup |
| `UNIVERSITY_NAME` | `Saint Louis College` |
| `CLINIC_NAME` | `University Clinic` |
| `CLINIC_ADDRESS` | Optional address for the print template |
| `CLINIC_CONTACT` | Optional contact details for the print template |
| `CLINIC_ORIGIN` | Optional exact public origin, including scheme and port |
| `COOKIE_SECURE` | Set to `true` when serving through HTTPS |
| `CLINIC_USER_PASSWORD` | Optional account-provisioning password; not used by the server |

For network deployment, use HTTPS, `COOKIE_SECURE=true`, an explicit `CLINIC_ORIGIN`, appropriate host binding, restricted database access, and your normal backups. Reverse proxies must preserve the original request `Host` header for same-origin validation. There is no account self-registration or browser role switch for certificate access. Account provisioning and deactivation are administrator operations on the server.

## Backend enforcement

Session cookies are random, HttpOnly, SameSite=Strict, and expire after eight hours. Only token hashes are stored in SQLite. Passwords are salted and hashed using scrypt. Each authenticated mutation requires its session's `X-CSRF-Token`; foreign origins are rejected. Login attempts are rate limited. Roles are read from the current active user record, never from submitted form fields.

All certificate changes use a database transaction containing the certificate write, actor/time audit snapshot, and required notifications. Submitted and approved content is locked. Every edit and transition requires the last observed integer `version`, so stale tabs and concurrent reviews cannot overwrite newer work. The database additionally rejects updates or deletion of approved certificates. Approval identity and timestamps are server-generated.

Certificate APIs, previews and print routes require authenticated clinic staff. Official printing also requires Approved status on the server. Database files, server sources, test sources, dotfiles and configuration files are not served publicly. Patient-facing static screens are not granted access to these APIs.

## Verification

```powershell
npm test
```

Tests create disposable accounts and databases in temporary directories. Coverage includes the complete returned/revised/approved flow, audit history, notifications, restart persistence, role forgery, unauthorized approval, CSRF, login limits, stale and concurrent writes, invalid dates and input, immutable approvals, source-file boundaries, and official print restrictions. Template tests verify output escaping and printable/unofficial layouts.

For a manual check, sign in as a nurse, save and submit a certificate, sign out, sign in as a doctor, return it with remarks, sign in as the nurse to revise/resubmit, approve it as a doctor, and print it from either account. Verify the A4 preview and signature area in your target browser and printer.
