-- 015: laboratory requirements. Every student must complete these before graduating.
--
-- Like the medical history, they belong to the student, not to a school year: one row per student that
-- stays on file when a new school year starts and the student is enrolled again. Each column holds the
-- date (YYYY-MM-DD) the requirement was marked done, or NULL while it is still missing.
CREATE TABLE IF NOT EXISTS student_requirements (
  patient_id              VARCHAR(50) NOT NULL PRIMARY KEY,
  cbc_on                  VARCHAR(10) NULL,
  cxr_pa_on               VARCHAR(10) NULL,
  urinalysis_on           VARCHAR(10) NULL,
  fecalysis_on            VARCHAR(10) NULL,
  hepa_b_screening_on     VARCHAR(10) NULL,
  hepa_b_titer_on         VARCHAR(10) NULL,
  blood_type_on           VARCHAR(10) NULL,
  pregnancy_test_on       VARCHAR(10) NULL,
  drug_test_on            VARCHAR(10) NULL,
  updated_at              VARCHAR(30) NOT NULL,
  updated_by              INT         NULL,
  CONSTRAINT fk_requirements_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_requirements_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
