-- Visits (consultations and wellness checkups) for the SLC University Clinic System.
-- Standalone run:  mysql -u root -p clinic < visits.sql
-- For schema.sql: paste the CREATE TABLE block after the `notifications` table.

CREATE TABLE IF NOT EXISTS visits (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  patient_id       VARCHAR(50)   NOT NULL,
  visit_type       ENUM('Consultation','Checkup') NOT NULL,
  visit_date       VARCHAR(10)   NOT NULL,
  complaint        VARCHAR(500)  NOT NULL,
  systolic         SMALLINT      NOT NULL,
  diastolic        SMALLINT      NOT NULL,
  weight_kg        DECIMAL(5,1)  NOT NULL,
  height_cm        DECIMAL(5,1)  NOT NULL,
  bmi              DECIMAL(4,1)  NOT NULL,
  bmi_status       VARCHAR(20)   NOT NULL,
  bp_status        VARCHAR(30)   NOT NULL,
  diagnosis        VARCHAR(100)  NOT NULL,
  notes            TEXT          NOT NULL,
  confidential     TINYINT(1)    NOT NULL DEFAULT 0,
  created_by       INT           NOT NULL,
  created_by_name  VARCHAR(200)  NOT NULL,
  created_at       VARCHAR(30)   NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX visits_patient ON visits(patient_id, visit_date);
CREATE INDEX visits_date    ON visits(visit_date, id);