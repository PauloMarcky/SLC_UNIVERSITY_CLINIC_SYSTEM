-- 014: a separate student list for every school year.
--
-- patients stays the permanent identity of a person (ID, name, birth date), so old visits, certificates
-- and prescriptions keep pointing at the right student. student_enrollments says which school years a
-- student is on the list for, with the college, course and year level they had that year.
--
-- A new school year starts with no enrollments, so its Student Records list is empty. Adding a student or
-- importing from Excel enrolls them in the current school year; a student who is already in the system
-- from an earlier year is simply enrolled again. Old years keep their lists.
CREATE TABLE IF NOT EXISTS student_enrollments (
  patient_id     VARCHAR(50)  NOT NULL,
  school_year_id INT          NOT NULL,
  college        VARCHAR(255) NOT NULL DEFAULT '',
  course         VARCHAR(100) NOT NULL DEFAULT '',
  year           VARCHAR(20)  NOT NULL DEFAULT '',
  created_at     VARCHAR(30)  NOT NULL,
  PRIMARY KEY (patient_id, school_year_id),
  KEY ix_enrollment_year (school_year_id),
  CONSTRAINT fk_enrollment_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_enrollment_year FOREIGN KEY (school_year_id) REFERENCES school_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing students: enroll each one in every school year they have a visit in.
INSERT IGNORE INTO student_enrollments (patient_id, school_year_id, college, course, year, created_at)
SELECT DISTINCT p.id, sy.id, p.college, p.course, p.year, '2026-08-03T00:00:00.000Z'
  FROM patients p
  JOIN visits v ON v.patient_id = p.id AND v.screened_copy_of IS NULL AND v.status <> 'cancelled'
  JOIN school_years sy ON v.visit_date >= sy.start_date
   AND v.visit_date < COALESCE((SELECT MIN(n.start_date) FROM school_years n WHERE n.start_date > sy.start_date), '9999-12-31');

-- Existing students with no visits yet go to today's school year (or the first one, if none has started).
INSERT IGNORE INTO student_enrollments (patient_id, school_year_id, college, course, year, created_at)
SELECT p.id,
       COALESCE((SELECT id FROM school_years WHERE start_date <= DATE_FORMAT(CURDATE(), '%Y-%m-%d') ORDER BY start_date DESC LIMIT 1),
                (SELECT id FROM school_years ORDER BY start_date ASC LIMIT 1)),
       p.college, p.course, p.year, '2026-08-03T00:00:00.000Z'
  FROM patients p
 WHERE NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.patient_id = p.id)
   AND EXISTS (SELECT 1 FROM school_years);
