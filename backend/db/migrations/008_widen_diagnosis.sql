-- 008: the doctor now types the clinical diagnosis as free text (it follows the Excel record),
-- so the column must hold longer entries than the old fixed category names.
ALTER TABLE visits
  MODIFY diagnosis VARCHAR(500) NOT NULL DEFAULT '';
