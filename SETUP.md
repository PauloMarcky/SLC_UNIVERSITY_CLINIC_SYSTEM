# Local setup

Get the clinic system running on your machine in about five minutes.

## Prerequisites

- **Node.js 22 LTS or newer** — check with `node --version`
- **MySQL 8.x** installed and running on port 3306 (Community Server, XAMPP, WAMP, or your OS package manager)
- **Git**

## First-time setup

### 1. Clone the repository

    git clone https://github.com/PauloMarcky/SLC_UNIVERSITY_CLINIC_SYSTEM.git
    cd SLC_UNIVERSITY_CLINIC_SYSTEM\backend

### 2. Install dependencies

    npm install

### 3. Create the database

Open the MySQL command line:

    mysql -u root -p

At the `mysql>` prompt, run these two commands. Use **forward slashes** in the path — MySQL handles them on Windows:

    source C:/full/path/to/SLC_UNIVERSITY_CLINIC_SYSTEM/backend/database/schema.sql
    source C:/full/path/to/SLC_UNIVERSITY_CLINIC_SYSTEM/backend/database/seed.sql

Replace the path with wherever you cloned the repo.

Verify:

    USE clinic;
    SHOW TABLES;
    SELECT * FROM patients;

You should see six tables and four patients. Exit:

    exit

### 4. Configure your environment

    Copy-Item .env.example .env      (PowerShell)
    cp .env.example .env             (bash / Git Bash)

Open `backend/.env` and set `DB_USER` and `DB_PASSWORD` to match your local MySQL install. Everything else stays at its default.

    notepad .env

### 5. Create the default staff accounts

    npm run seed-users

This creates two accounts you can log in with immediately:

| Username | Password | Role |
|---|---|---|
| `nurse1` | `clinic-dev-2026` | Nurse |
| `doctor1` | `clinic-dev-2026` | Doctor |

Change these passwords before any real deployment.

### 6. Start the server

    npm start

Open <http://127.0.0.1:3000> and log in.

## Daily workflow

    cd backend
    npm run dev      # auto-reload on file changes

## Reset the database

If you break something and want a clean slate:

    mysql -u root -p

At the `mysql>` prompt:

    DROP DATABASE clinic;
    source C:/full/path/to/backend/database/schema.sql
    source C:/full/path/to/backend/database/seed.sql
    exit

Then re-create the default users:

    npm run seed-users

## Adding more staff accounts

    npm run create-user -- username nurse "Full Name"
    npm run create-user -- username doctor "Full Name"

You'll be prompted for a password (12–200 characters, hidden while typing).

## Running tests

    npm test

**Warning:** tests truncate every table in your `clinic` database. Any certificates, sessions, or non-default users you created will be wiped. After testing, run `npm run seed-users` again to restore the default accounts.

## Troubleshooting

**`ER_ACCESS_DENIED_ERROR`** — Wrong `DB_USER` or `DB_PASSWORD` in `backend/.env`.

**`ER_BAD_DB_ERROR: Unknown database 'clinic'`** — Schema hasn't been applied. Run step 3.

**`EADDRINUSE` on port 3000** — Something else is using port 3000 (VPN services sometimes do). Set `PORT=3001` in `backend/.env`.

**MySQL on a non-default port** — Set `DB_PORT` in `backend/.env` to match (XAMPP sometimes uses 3307).

**Duplicate key name / Trigger already exists when running schema.sql** — Harmless. Means the schema was already applied. Ignore.

## Notes

- **Each teammate has their own local database.** Certificates you create on your machine are not visible to anyone else. This is normal — it lets everyone work in parallel.
- **Never commit `backend/.env`.** It contains your password. `.gitignore` already excludes it.
- **The default password `clinic-dev-2026` is for local development only.** Change it before deploying anywhere public.