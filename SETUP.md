# Local setup

Get the clinic system running on your machine in about five minutes.

## Prerequisites

- **Node.js 24 or newer**: check with `node --version`
- **MySQL 8.x** installed and running on port 3306 (Community Server, XAMPP, WAMP, or your OS package manager)
- **Git**

## First-time setup

### 1. Clone the repository

    git clone https://github.com/PauloMarcky/SLC_UNIVERSITY_CLINIC_SYSTEM.git
    cd SLC_UNIVERSITY_CLINIC_SYSTEM\backend

### 2. Install dependencies

    npm install

### 3. Configure your environment

    Copy-Item .env.example .env      (PowerShell)
    cp .env.example .env             (bash / Git Bash)

Open `backend/.env` and set `DB_HOST`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` to match your local MySQL install. `DB_NAME` is the database the migrations will create, for example `clinic`.

### 4. Create the database

    npm run migrate

This creates the database if it is missing and applies every file in `backend/db/migrations/` in order. It is safe to run again at any time: it only applies migrations that are new. The schema lives only in the migration files. Do not run `schema.sql`.

Verify in the MySQL command line:

    USE clinic;
    SHOW TABLES;

### 5. Optional: load sample patients

    mysql -u root -p clinic < database/seed.sql

### 6. Create the default staff accounts

    npm run seed-users

This creates two accounts you can log in with immediately:

| Username | Password | Role |
|---|---|---|
| `nurse1` | `clinic-dev-2026` | Nurse |
| `doctor1` | `clinic-dev-2026` | Doctor |

Change these passwords before any real deployment.

### 7. Start the server

    npm start

Open <http://127.0.0.1:3000> and log in.

## Daily workflow

    cd backend
    npm run migrate   # after pulling changes that add migrations
    npm run dev       # auto-reload on file changes

## Adding more staff accounts

    npm run create-user -- username nurse "Full Name"
    npm run create-user -- username doctor "Full Name"

You'll be prompted for a password (12-200 characters, hidden while typing).

## Running tests

    npm test

**Warning:** tests truncate tables in the database named by `DB_NAME`. Point `DB_NAME` at a separate test database before running them, never at data you want to keep. After testing, run `npm run seed-users` again to restore the default accounts.

## Troubleshooting

**`ER_ACCESS_DENIED_ERROR`**: Wrong `DB_USER` or `DB_PASSWORD` in `backend/.env`.

**`Missing MySQL environment variable(s)`**: `backend/.env` is missing or incomplete. Copy `.env.example` and fill it in.

**`EADDRINUSE` on port 3000**: Something else is using port 3000 (VPN services sometimes do). Set `PORT=3001` in `backend/.env`.

**MySQL on a non-default port**: Set `DB_PORT` in `backend/.env` to match (XAMPP sometimes uses 3307).

**`Migration failed`**: Read the message, fix the cause, and run `npm run migrate` again. Applied migrations are skipped.

## Notes

- **Each teammate has their own local database.** Records you create on your machine are not visible to anyone else.
- **Never commit `backend/.env`.** It contains your password. `.gitignore` already excludes it.
- **The default password `clinic-dev-2026` is for local development only.** Change it before deploying anywhere public.
- **Schema changes go in a new numbered migration**, never in an edit to an applied one.