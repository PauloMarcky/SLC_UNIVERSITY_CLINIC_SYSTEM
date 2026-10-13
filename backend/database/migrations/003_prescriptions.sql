-- Prescription + inventory tables (MySQL 8 / MariaDB 10.5+).
-- Run once:  mysql -u <user> -p <database> < 002_prescriptions.sql
--
-- Notes
-- * created_at columns are VARCHAR(32) holding ISO strings, to match how visits/sessions
--   already store timestamps in your code (new Date().toISOString()).
-- * No FOREIGN KEY to visits/patients on purpose: I have not seen your schema, and a type
--   mismatch (INT vs BIGINT, collation) makes the whole script fail. Add them once you
--   confirm the column types.

CREATE TABLE IF NOT EXISTS medicines (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  category      VARCHAR(80)  NOT NULL DEFAULT '',
  unit          VARCHAR(20)  NOT NULL DEFAULT 'tab',
  reorder_level INT UNSIGNED NOT NULL DEFAULT 0,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    VARCHAR(32)  NOT NULL,
  UNIQUE KEY uq_medicine_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per delivery/lot. Stock of a medicine = sum of its batches.
CREATE TABLE IF NOT EXISTS medicine_batches (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  medicine_id   BIGINT UNSIGNED NOT NULL,
  lot_no        VARCHAR(60)  NOT NULL,
  quantity      INT          NOT NULL DEFAULT 0,
  expiry_date   DATE         NOT NULL,
  supplier      VARCHAR(150) NOT NULL DEFAULT '',
  date_received DATE         NOT NULL,
  created_at    VARCHAR(32)  NOT NULL,
  CONSTRAINT chk_batch_qty CHECK (quantity >= 0),
  KEY ix_batch_fefo (medicine_id, expiry_date),
  CONSTRAINT fk_batch_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prescription header: one per visit. status: pending -> dispensed | cancelled
CREATE TABLE IF NOT EXISTS prescriptions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  visit_id           BIGINT UNSIGNED NOT NULL,
  patient_id         VARCHAR(50)  NOT NULL,
  status             VARCHAR(12)  NOT NULL DEFAULT 'pending',
  created_by         BIGINT UNSIGNED NOT NULL,
  created_by_name    VARCHAR(150) NOT NULL,
  created_at         VARCHAR(32)  NOT NULL,
  dispensed_by       BIGINT UNSIGNED NULL,
  dispensed_by_name  VARCHAR(150) NULL,
  dispensed_at       VARCHAR(32)  NULL,
  cancelled_reason   VARCHAR(300) NULL,
  KEY ix_rx_visit (visit_id),
  KEY ix_rx_patient (patient_id),
  KEY ix_rx_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What the doctor ordered.
CREATE TABLE IF NOT EXISTS prescription_items (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  prescription_id BIGINT UNSIGNED NOT NULL,
  medicine_id     BIGINT UNSIGNED NOT NULL,
  dose            VARCHAR(100) NOT NULL,
  frequency       VARCHAR(60)  NOT NULL,
  duration_days   INT UNSIGNED NOT NULL,
  quantity        INT UNSIGNED NOT NULL,
  instructions    VARCHAR(300) NOT NULL DEFAULT '',
  KEY ix_item_rx (prescription_id),
  CONSTRAINT fk_item_rx FOREIGN KEY (prescription_id) REFERENCES prescriptions(id),
  CONSTRAINT fk_item_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What was physically handed out, and from which batch (an item can span batches).
CREATE TABLE IF NOT EXISTS dispense_lines (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id   BIGINT UNSIGNED NOT NULL,
  batch_id  BIGINT UNSIGNED NOT NULL,
  quantity  INT UNSIGNED NOT NULL,
  KEY ix_line_item (item_id),
  CONSTRAINT fk_line_item FOREIGN KEY (item_id) REFERENCES prescription_items(id),
  CONSTRAINT fk_line_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every in/out/adjustment (FR-7.10). change_qty is signed.
CREATE TABLE IF NOT EXISTS stock_movements (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id    BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NOT NULL,
  change_qty  INT          NOT NULL,
  reason      VARCHAR(30)  NOT NULL,   -- received | dispensed | damaged | lost | expired_disposal | correction
  ref         VARCHAR(60)  NOT NULL DEFAULT '',   -- e.g. RX-12 or a remark
  user_id     BIGINT UNSIGNED NOT NULL,
  user_name   VARCHAR(150) NOT NULL,
  created_at  VARCHAR(32)  NOT NULL,
  KEY ix_move_medicine (medicine_id, id),
  KEY ix_move_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
