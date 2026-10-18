# Database migrations

Schema changes are applied through `npm run migrate` (run from `backend/`).

## How it works

- Each `.sql` file in this folder is one migration, applied in filename order.
- `migrate.js` records applied files in the `schema_migrations` table.
- Already-applied migrations are skipped, so `npm run migrate` is safe to run
  repeatedly — it only applies what is new.
- Existing databases are auto-baselined: the first time migrations run against
  a database that already has the `patients` table but no `schema_migrations`
  history, `001_init.sql` is marked as applied without being executed. No data
  is touched.

## Adding a new migration

1. Create a new file with the next number, e.g. `002_add_patient_email.sql`.
2. Write plain SQL. Do not include `CREATE DATABASE` or `USE` — the target
   database is selected from your `.env` (`DB_NAME`).
3. If you need triggers or stored procedures, wrap them in `DELIMITER $$ ... $$`
   as in `001_init.sql`. `migrate.js` strips those directives before sending.
4. Commit it. Teammates pick it up with `git pull` and run `npm run migrate`.

## Rules

- Never edit a migration that has already been applied. Add a new one instead.
- Never delete a migration file that teammates may have already run.
- Prefer idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, etc.).
- To add a column, write `-- @add-column <table> <column> <definition>` on its own line instead of
  `ALTER TABLE ... ADD COLUMN`. The runner skips it if the column already exists, so a migration that
  stopped half-way can be run again. (MySQL has no `ADD COLUMN IF NOT EXISTS`.)
- Never use `DROP TABLE` or `TRUNCATE` in a migration without team sign-off.

## First-time setup (fresh clone)

    cd backend
    npm install
    npm run migrate      # creates the DB if missing, applies all migrations
    npm run seed-users   # optional: seed initial users
    npm run dev

- `014_student_enrollments.sql` — one student list per school year (`student_enrollments`). Existing students are enrolled in the school years their visits fall in.
- `015_student_requirements.sql` — laboratory requirements (CBC, CXR-PA, Urinalysis, Fecalysis, Hepa-B Screening, Hepa-B Titer, Blood Type, Pregnancy Test, Drug Test). One row per student; kept when a new school year starts.
