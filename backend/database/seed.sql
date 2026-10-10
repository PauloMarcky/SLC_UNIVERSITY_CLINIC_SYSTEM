-- SLC University Clinic System — seed data
-- Run: mysql -u root -p clinic < backend/database/seed.sql
--
-- Safe to re-run: INSERT IGNORE skips rows that already exist.
-- Staff accounts are NOT seeded here — create them with:
--   npm run create-user -- <username> <nurse|doctor> "<Full Name>"

USE clinic;

INSERT IGNORE INTO patients(id, name, college, course, year, category) VALUES
  ('2026-00123', 'Maria Dizon',  'IT',          'BSIT', '3', 'student'),
  ('2025-00456', 'Paolo Reyes',  'Engineering', 'BSCE', '4', 'student'),
  ('2024-00789', 'Angela Cruz',  'Nursing',     'BSN',  '2', 'student'),
  ('E-0098',     'Jose Ramos',   'Maintenance', '',     '',  'employee');