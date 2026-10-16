-- 009: a checkup put to Screening is saved twice.
-- The original stays in Checkup; the copy appears in Screening and points back to the original.
ALTER TABLE visits
  ADD COLUMN screened_copy_of INT NULL;

CREATE INDEX visits_screened_copy ON visits(screened_copy_of);