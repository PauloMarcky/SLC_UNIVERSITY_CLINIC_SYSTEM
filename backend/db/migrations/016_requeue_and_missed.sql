-- 016: Did not proceed -> Re-queue, and the "missed" status.
-- A triaged visit that is not examined within the window (default 2 calendar days) is saved on the
-- student's record as "missed". It is a status, not a delete, and it is not an examined visit.
ALTER TABLE visits
  MODIFY status ENUM('triaged','completed','cancelled','missed') NOT NULL DEFAULT 'completed';

-- When a visit is re-queued its visit_date moves to the day it came back; the day the vitals were
-- really taken is kept here, together with who re-queued it and when.
-- @add-column visits original_visit_date VARCHAR(10) NULL
-- @add-column visits requeued_by INT NULL
-- @add-column visits requeued_by_name VARCHAR(200) NULL
-- @add-column visits requeued_at VARCHAR(30) NULL

-- When the visit was closed as missed.
-- @add-column visits missed_at VARCHAR(30) NULL
