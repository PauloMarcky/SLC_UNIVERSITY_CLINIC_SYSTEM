-- Prescriptions now store the medicine as typed text; the medicine inventory is no longer used.
-- Old tables (medicines, medicine_batches, stock_movements, dispense_lines) are left in place and untouched.
-- @add-column prescription_items medicine_name VARCHAR(150) NOT NULL DEFAULT ''
ALTER TABLE prescription_items MODIFY medicine_id BIGINT UNSIGNED NULL;
UPDATE prescription_items i JOIN medicines m ON m.id = i.medicine_id SET i.medicine_name = m.name WHERE i.medicine_name = '';