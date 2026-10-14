-- 005: student and employee logins are removed. Patient records are kept.
DELETE FROM sessions
  WHERE user_id IN (SELECT id FROM users WHERE role IN ('student','employee'));
DELETE FROM notifications
  WHERE recipient_id IN (SELECT id FROM users WHERE role IN ('student','employee'));
DELETE FROM users WHERE role IN ('student','employee');

ALTER TABLE users MODIFY role ENUM('nurse','doctor') NOT NULL;
