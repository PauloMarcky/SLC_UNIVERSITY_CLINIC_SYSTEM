// Database migration runner for the SLC University Clinic System.
//
// Usage:  npm run migrate   (from backend/)
//
// Behavior:
//   * Creates the target database if it does not exist.
//   * Creates a schema_migrations tracking table if it does not exist.
//   * Auto-baselines an existing database: if the `patients` table already
//     exists but no migrations are recorded, the first migration is marked
//     applied without being executed (so existing data is preserved).
//   * Applies any not-yet-applied *.sql files from ./migrations, in filename
//     order, one at a time, and records each success.
//
// It never drops tables, truncates data, or alters existing structures unless
// a migration file explicitly does so. Safe to re-run.

import mysql from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Missing MySQL environment variable(s): ${missing.join(', ')}.`);
  console.error('Copy backend/.env.example to backend/.env and fill in your local MySQL credentials.');
  process.exit(1);
}

const baseConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

function stripDelimiters(sql) {
  // mysql2 sends whole statements to the server, which understands BEGIN..END
  // blocks natively. The DELIMITER keyword is a mysql CLI feature only, so we
  // remove it (and its custom terminator on END$$) before executing.
  return sql
    .replace(/^[ \t]*DELIMITER[ \t]+\$\$[ \t]*$/gim, '')
    .replace(/^[ \t]*DELIMITER[ \t]+;[ \t]*$/gim, '')
    .replace(/END\$\$/g, 'END');
}

async function ensureDatabaseExists() {
  const conn = await mysql.createConnection(baseConfig);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` ` +
      `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id         INT PRIMARY KEY AUTO_INCREMENT,
       name       VARCHAR(255) NOT NULL UNIQUE,
       applied_at VARCHAR(30)  NOT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [process.env.DB_NAME, tableName]
  );
  return rows[0].count > 0;
}

async function appliedMigrations(conn) {
  const [rows] = await conn.query('SELECT name FROM schema_migrations');
  return new Set(rows.map(r => r.name));
}

async function recordMigration(conn, name) {
  await conn.query(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
    [name, new Date().toISOString()]
  );
}

async function run() {
  await ensureDatabaseExists();

  const conn = await mysql.createConnection({
    ...baseConfig,
    database: process.env.DB_NAME,
  });

  try {
    await ensureMigrationsTable(conn);

    const files = (await readdir(migrationsDir))
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found in database/migrations/.');
      return;
    }

    const applied = await appliedMigrations(conn);

    // Auto-baseline: existing database with no migration history yet.
    if (applied.size === 0 && await tableExists(conn, 'patients')) {
      const baseline = files[0];
      await recordMigration(conn, baseline);
      applied.add(baseline);
      console.log(`Existing schema detected. Baselined as: ${baseline}`);
    }

    let appliedAny = false;
    for (const file of files) {
      if (applied.has(file)) continue;

      const raw = await readFile(join(migrationsDir, file), 'utf8');
      const sql = stripDelimiters(raw);

      process.stdout.write(`Applying ${file} ... `);
      await conn.query(sql);
      await recordMigration(conn, file);
      appliedAny = true;
      console.log('ok');
    }

    console.log(
      appliedAny
        ? 'Migrations complete.'
        : 'Database is up to date. Nothing to apply.'
    );
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});