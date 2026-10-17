-- 010: paper-form medical history, nurse notes, outside-lab clinic name, urgent flag, optional vitals.
-- Safe to run again after a failure: the "@add-column" lines skip columns that already exist, and
-- the MODIFY and UPDATE statements give the same result when repeated.

-- Past medical history (paper form): asthma, allergy and Hepatitis-B details.
-- @add-column patient_medical_history asthma_last_attack VARCHAR(50)  NOT NULL DEFAULT ''
-- @add-column patient_medical_history asthma_medicine    VARCHAR(300) NOT NULL DEFAULT ''
-- @add-column patient_medical_history allergy_food       VARCHAR(300) NOT NULL DEFAULT ''
-- @add-column patient_medical_history allergy_medicine   VARCHAR(300) NOT NULL DEFAULT ''
-- @add-column patient_medical_history hepatitis_b        TINYINT(1)   NOT NULL DEFAULT 0

-- Nurse's own notes (her initial findings). The doctor reads them and writes his own notes separately.
-- @add-column visits nurse_notes TEXT NULL

-- Outside laboratory: only the clinic name and the date it was received. The results stay on paper.
-- @add-column visits lab_source_name  VARCHAR(200) NOT NULL DEFAULT ''
-- @add-column visits lab_received_at  VARCHAR(10)  NULL

-- Emergencies go to the top of the doctor's queue.
-- @add-column visits urgent TINYINT(1) NOT NULL DEFAULT 0

-- Result of a Checkup, chosen by the doctor.
-- @add-column visits checkup_result ENUM('Cleared','Needs screening') NULL

-- A visit entered by mistake can be cancelled. Vitals may be empty (a Checkup does not always have them).
ALTER TABLE visits
  MODIFY status      ENUM('triaged','completed','cancelled') NOT NULL DEFAULT 'completed',
  MODIFY systolic    SMALLINT     NULL,
  MODIFY diastolic   SMALLINT     NULL,
  MODIFY weight_kg   DECIMAL(5,1) NULL,
  MODIFY height_cm   DECIMAL(5,1) NULL,
  MODIFY bmi         DECIMAL(4,1) NULL,
  MODIFY bmi_status  VARCHAR(20)  NULL,
  MODIFY bp_status   VARCHAR(30)  NULL;

-- Completed Checkups that already exist: Needs screening if a Screening copy exists, otherwise Cleared.
UPDATE visits v
  LEFT JOIN visits c ON c.screened_copy_of = v.id
   SET v.checkup_result = IF(c.id IS NULL, 'Cleared', 'Needs screening')
 WHERE v.visit_type = 'Checkup' AND v.status = 'completed'
   AND v.screened_copy_of IS NULL AND v.checkup_result IS NULL;