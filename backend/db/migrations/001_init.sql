-- Baseline schema for SLC University Clinic System (MySQL 8.x).
--
-- Applied via `npm run migrate` from backend/. The runner has already created
-- and selected the target database from .env (DB_NAME). All statements are
-- idempotent, so re-running against an existing database is safe.

-- Timestamps are VARCHAR(30) ISO-8601 strings. JSON-ish columns are TEXT.
-- patients is defined first because users references it.

CREATE TABLE IF NOT EXISTS patients (
  id        VARCHAR(50)  PRIMARY KEY,
  name      VARCHAR(200) NOT NULL,
  college   VARCHAR(100) NOT NULL DEFAULT '',
  course    VARCHAR(100) NOT NULL DEFAULT '',
  year      VARCHAR(20)  NOT NULL DEFAULT '',
  category  VARCHAR(20)  NOT NULL DEFAULT 'student'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  username       VARCHAR(100) NOT NULL UNIQUE,
  name           VARCHAR(200) NOT NULL,
  role           ENUM('nurse','doctor','student','employee') NOT NULL,
  patient_id     VARCHAR(50)  NULL,
  password_hash  VARCHAR(255) NOT NULL,
  active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     VARCHAR(30)  NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  CHAR(64)     PRIMARY KEY,
  user_id     INT          NOT NULL,
  csrf_token  CHAR(64)     NOT NULL,
  expires_at  BIGINT       NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificates (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  patient_id        VARCHAR(50)  NOT NULL,
  patient_json      TEXT         NOT NULL,
  patient_name      VARCHAR(200) NOT NULL,
  type              VARCHAR(100) NOT NULL,
  certificate_date  VARCHAR(10)  NOT NULL,
  purpose           TEXT         NOT NULL,
  findings          TEXT         NOT NULL,
  recommendations   TEXT         NOT NULL,
  other_details     TEXT         NOT NULL,
  status            ENUM('Draft','Pending Approval','Returned for Revision','Approved') NOT NULL,
  version           INT          NOT NULL DEFAULT 1,
  created_at        VARCHAR(30)  NOT NULL,
  updated_at        VARCHAR(30)  NOT NULL,
  created_by        INT          NOT NULL,
  created_by_name   VARCHAR(200) NOT NULL,
  updated_by        INT          NOT NULL,
  updated_by_name   VARCHAR(200) NOT NULL,
  submitted_at      VARCHAR(30)  NULL,
  submitted_by      INT          NULL,
  submitted_by_name VARCHAR(200) NULL,
  approved_at       VARCHAR(30)  NULL,
  approved_by       INT          NULL,
  approved_by_name  VARCHAR(200) NULL,
  remarks           TEXT         NOT NULL,
  revised_from_id   INT          NULL,
  FOREIGN KEY (patient_id)      REFERENCES patients(id),
  FOREIGN KEY (created_by)      REFERENCES users(id),
  FOREIGN KEY (updated_by)      REFERENCES users(id),
  FOREIGN KEY (submitted_by)    REFERENCES users(id),
  FOREIGN KEY (approved_by)     REFERENCES users(id),
  FOREIGN KEY (revised_from_id) REFERENCES certificates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificate_history (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  certificate_id       INT          NOT NULL,
  action               VARCHAR(100) NOT NULL,
  actor_id             INT          NOT NULL,
  actor_name           VARCHAR(200) NOT NULL,
  created_at           VARCHAR(30)  NOT NULL,
  remarks              TEXT         NOT NULL,
  certificate_version  INT          NOT NULL,
  snapshot_json        TEXT         NOT NULL,
  FOREIGN KEY (certificate_id) REFERENCES certificates(id),
  FOREIGN KEY (actor_id)       REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  recipient_id    INT          NOT NULL,
  certificate_id  INT          NOT NULL,
  message         TEXT         NOT NULL,
  created_at      VARCHAR(30)  NOT NULL,
  read_at         VARCHAR(30)  NULL,
  FOREIGN KEY (recipient_id)   REFERENCES users(id),
  FOREIGN KEY (certificate_id) REFERENCES certificates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX certificates_status    ON certificates(status, updated_at);
CREATE INDEX history_certificate    ON certificate_history(certificate_id, id);
CREATE INDEX notification_recipient ON notifications(recipient_id, id);

DELIMITER $$

CREATE TRIGGER protect_approved_certificate_update
BEFORE UPDATE ON certificates
FOR EACH ROW
BEGIN
  IF OLD.status = 'Approved' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Approved certificates are immutable';
  END IF;
END$$

CREATE TRIGGER protect_approved_certificate_delete
BEFORE DELETE ON certificates
FOR EACH ROW
BEGIN
  IF OLD.status = 'Approved' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Approved certificates are immutable';
  END IF;
END$$

DELIMITER ;