-- 007: body temperature (degrees C) recorded by the nurse at triage.
ALTER TABLE visits
  ADD COLUMN body_temperature DECIMAL(4,1) NULL;