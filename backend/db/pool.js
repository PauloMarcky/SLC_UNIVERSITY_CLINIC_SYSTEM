import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export async function closePool() {
  await pool.end();
}

// Test helper: empties the tables the tests touch and re-seeds four sample patients.
// The inventory/prescription tables are listed first because they point at visits and patients.
export async function resetDatabase() {
  // Safety guard: this function empties tables. Only ever run it on a test database.
  if (!/_test$/i.test(String(env.db.database))) {
    throw new Error(
      `Refusing to reset database "${env.db.database}": tests only run on a database whose name ends with _test. ` +
      'Run the tests with "npm test" (it loads backend/.env.test).'
    );
  }
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'dispense_lines', 'prescription_items', 'prescriptions', 'stock_movements',
      'medicine_batches', 'medicines',
      'notifications', 'certificate_history', 'certificates', 'sessions', 'student_requirements', 'student_enrollments', 'school_years', 'users', 'patients',
      'visits', 'patient_medical_history'
    ]) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.query(
      `INSERT INTO patients(id,name,college,course,year,category) VALUES
       ('2026-00123','Maria Dizon','IT','BSIT','3','student'),
       ('2025-00456','Paolo Reyes','Engineering','BSCE','4','student'),
       ('2024-00789','Angela Cruz','Nursing','BSN','2','student'),
       ('E-0098','Jose Ramos','Maintenance','','','employee')`
    );
  } finally {
    connection.release();
  }
}

/** Runs `work(connection)` in one transaction. Commits on success, rolls back if it throws. */
export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
