import mysql from 'mysql2/promise';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Missing MySQL environment variable(s): ${missing.join(', ')}. ` +
    `Copy backend/.env.example to backend/.env and fill in your local MySQL credentials.`
  );
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
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

export async function resetDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['notifications', 'certificate_history', 'certificates', 'sessions', 'users', 'patients']) {
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