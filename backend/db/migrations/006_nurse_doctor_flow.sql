-- 006: nurse triage -> doctor examination -> optional Screening flow.
-- Extends existing tables; nothing is dropped.

-- Patient registration fields (paper identification form).
ALTER TABLE patients
  ADD COLUMN last_name        VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN first_name       VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN middle_name      VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN gender           ENUM('Male','Female') NULL,
  ADD COLUMN date_of_birth    DATE NULL,
  ADD COLUMN civil_status     VARCHAR(20)  NOT NULL DEFAULT '',
  ADD COLUMN nationality      VARCHAR(50)  NOT NULL DEFAULT 'Filipino',
  ADD COLUMN contact_number   VARCHAR(30)  NOT NULL DEFAULT '',
  ADD COLUMN address          VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN guardian_name    VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN guardian_contact VARCHAR(30)  NOT NULL DEFAULT '';

UPDATE patients
   SET last_name  = TRIM(SUBSTRING_INDEX(name, ' ', -1)),
       first_name = TRIM(SUBSTRING(name, 1, CHAR_LENGTH(name) - CHAR_LENGTH(SUBSTRING_INDEX(name, ' ', -1))))
 WHERE last_name = '' AND first_name = '';

-- Past medical history belongs to the patient, recorded once.
CREATE TABLE IF NOT EXISTS patient_medical_history (
  patient_id          VARCHAR(50)  NOT NULL PRIMARY KEY,
  asthma              TINYINT(1)   NOT NULL DEFAULT 0,
  allergy             TINYINT(1)   NOT NULL DEFAULT 0,
  allergy_details     VARCHAR(300) NOT NULL DEFAULT '',
  febrile_convulsion  TINYINT(1)   NOT NULL DEFAULT 0,
  fainting_spell      TINYINT(1)   NOT NULL DEFAULT 0,
  epilepsy            TINYINT(1)   NOT NULL DEFAULT 0,
  vaccines            VARCHAR(300) NOT NULL DEFAULT '',
  other_condition     VARCHAR(300) NOT NULL DEFAULT '',
  updated_at          VARCHAR(30)  NOT NULL,
  updated_by          INT          NULL,
  CONSTRAINT fk_history_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_history_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Visits: nurse triage fields, doctor SOAP fields, screening flag.
ALTER TABLE visits
  MODIFY diagnosis VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN status                 ENUM('triaged','completed') NOT NULL DEFAULT 'completed',
  ADD COLUMN nurse_id               INT NULL,
  ADD COLUMN nurse_name             VARCHAR(200) NULL,
  ADD COLUMN doctor_id              INT NULL,
  ADD COLUMN doctor_name            VARCHAR(200) NULL,
  ADD COLUMN pulse_rate             SMALLINT NULL,
  ADD COLUMN initial_diagnosis      VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN external_labs_attached TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN soap_subjective        TEXT NULL,
  ADD COLUMN soap_objective         TEXT NULL,
  ADD COLUMN soap_assessment        TEXT NULL,
  ADD COLUMN soap_plan              TEXT NULL,
  ADD COLUMN actions_taken          TEXT NULL,
  ADD COLUMN sent_to_hospital       TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN is_screened            TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN screened_by            INT NULL,
  ADD COLUMN screened_at            VARCHAR(30) NULL,
  ADD COLUMN screened_note          VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN completed_at           VARCHAR(30) NULL;

-- Existing visits were all recorded by doctors.
UPDATE visits
   SET doctor_id = created_by,
       doctor_name = created_by_name,
       completed_at = created_at
 WHERE doctor_id IS NULL;

ALTER TABLE visits
  ADD CONSTRAINT fk_visits_nurse    FOREIGN KEY (nurse_id)     REFERENCES users(id),
  ADD CONSTRAINT fk_visits_doctor   FOREIGN KEY (doctor_id)    REFERENCES users(id),
  ADD CONSTRAINT fk_visits_screener FOREIGN KEY (screened_by)  REFERENCES users(id),
  ADD CONSTRAINT chk_screened_checkup CHECK (is_screened = 0 OR visit_type = 'Checkup');

CREATE INDEX visits_status   ON visits(status, visit_date);
CREATE INDEX visits_screened ON visits(is_screened, visit_date);