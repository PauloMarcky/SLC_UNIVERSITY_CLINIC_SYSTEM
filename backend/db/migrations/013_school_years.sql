-- 013: school years. Every school year starts a fresh set of records, and the old years stay on file.
--
-- Nothing is copied or deleted. A visit belongs to the school year its visit_date falls in, worked out
-- when the page is opened, so when the doctor changes a school year's dates the visits move with it.
-- Visits dated after a year's end date and before the next year starts (the summer break) stay with the
-- year that just finished.
--
-- Dates are YYYY-MM-DD text, like visits.visit_date. The doctor edits the dates in the School Years page.
CREATE TABLE IF NOT EXISTS school_years (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  label       VARCHAR(50)  NOT NULL,
  start_date  VARCHAR(10)  NOT NULL,
  end_date    VARCHAR(10)  NOT NULL,
  created_at  VARCHAR(30)  NOT NULL,
  updated_at  VARCHAR(30)  NOT NULL,
  updated_by  INT          NULL,
  CONSTRAINT uq_school_years_label UNIQUE (label),
  CONSTRAINT uq_school_years_start UNIQUE (start_date),
  CONSTRAINT fk_school_years_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starting point: school year 2026-2027 runs Aug 3, 2026 to Jun 4, 2027. The doctor can change it.
INSERT IGNORE INTO school_years (label, start_date, end_date, created_at, updated_at)
VALUES ('2026-2027', '2026-08-03', '2027-06-04', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

-- Records that already exist from before Aug 3, 2026 go to the school year before it.
INSERT IGNORE INTO school_years (label, start_date, end_date, created_at, updated_at)
SELECT '2025-2026', '2025-08-03', '2026-06-04', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'
 WHERE EXISTS (SELECT 1 FROM visits WHERE visit_date < '2026-08-03');
