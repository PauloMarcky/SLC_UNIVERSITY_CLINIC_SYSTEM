-- 011: the Department dropdown saves "College - Program", which can pass 100 characters.
ALTER TABLE patients
  MODIFY COLUMN college VARCHAR(255) NOT NULL DEFAULT '';
