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

 
-- Default student test data: 3 students per college.
-- Safe to re-run: INSERT IGNORE skips IDs that already exist.
INSERT IGNORE INTO patients(id, name, college, course, year, category) VALUES
  ('11-11111', 'Marcky Paulo E. Balaba', 'College of Information Technology', 'BSIT', '3', 'student'),
  ('22-22222', 'Meyard Bolisay',         'College of Information Technology', 'BSIT', '2', 'student'),
  ('33-33333', 'Joseph Dionisio',        'College of Information Technology', 'BSIT', '1', 'student'),
  ('44-44444', 'Daniel Reyes',           'College of Engineering',             'BSCE', '3', 'student'),
  ('55-55555', 'Andrea Santos',          'College of Engineering',             'BSEE', '2', 'student'),
  ('66-66666', 'Kevin Mendoza',          'College of Engineering',             'BSCE', '1', 'student'),
  ('77-77777', 'Miguel Garcia',          'College of Business Administration',  'BSBA', '3', 'student'),
  ('88-88888', 'Sophia Cruz',            'College of Business Administration',  'BSBA', '2', 'student'),
  ('99-99999', 'Ethan Ramos',            'College of Business Administration',  'BSBA', '1', 'student'),
  ('10-10101', 'Hannah Flores',          'College of Education',               'BSED', '3', 'student'),
  ('20-20202', 'Joshua Navarro',         'College of Education',               'BEED', '2', 'student'),
  ('30-30303', 'Maria Torres',           'College of Education',               'BSED', '1', 'student');