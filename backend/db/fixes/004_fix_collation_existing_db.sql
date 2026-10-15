-- ONLY for databases that already ran the OLD 002_prescriptions.sql (before COLLATE was added).
-- Fresh databases do not need this file. Safe to run more than once. Keep it OUT of the folder
-- that "npm run migrate" runs automatically, or run it by hand once per existing database.
ALTER TABLE medicines          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE medicine_batches   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE prescriptions      CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE prescription_items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE dispense_lines     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE stock_movements    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
