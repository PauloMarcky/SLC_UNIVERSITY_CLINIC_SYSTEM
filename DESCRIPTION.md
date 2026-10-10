# ULS School Clinic System

Combines Prototype v1 (Doctor/Nurse workflows, requirements tracking, inventory, statistics) with the HTML/CSS multi-page prototype (student/employee portals). Based on the MOM with the ULS Clinic Doctor. Open `index.html` to start.

**Certificate workflow:** the certificate module now uses a Node.js/SQLite backend with authenticated nurse and doctor accounts, drafts, approval and revision requests, activity history, notifications, and approved-only A4 printing. Follow [the setup guide](docs/CERTIFICATES.md) and open the server URL to use it. Opening HTML files directly does not enable certificate operations.

**Other modules remain prototypes:** their sample data is fictional. Search, pagination, auto-calculated Age/BMI/BP, record date-stamping, inventory deduction, and expiry alerts in those modules still need a backend. The certificate database reuses the fictional patient records already represented by the project.

## Pages
`index` login | `doctor-dashboard` | `visits` (consultations vs. checkups) | `consultation-form` | `medical-records` (college tabs, requirements, employee categories) | `record-detail` | `nurse-dashboard` | `inventory` | `statistics` | `student-dashboard` | `employee-dashboard` | `css/style.css`

## MOM coverage
Walk-in sickness vs. scheduled dental/vaccination; separate logs; BMI/BP color coding; condition tallies and outbreak graphs; per-college stats; employee groups (Deans, Full-Time, Part-Time/City, Maintenance); red expiry and low-stock alerts; Excel-like tables.

## Assumptions
Student/employee portals and the confidential-visit flag (from v1) are not in the MOM. College counts total 6,367 students.
