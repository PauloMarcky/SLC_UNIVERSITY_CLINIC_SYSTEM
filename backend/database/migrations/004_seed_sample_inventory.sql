-- OPTIONAL: the six sample medicines from your old static inventory page, for testing.
-- Skip this on a real clinic database; use "Stock In" on the Inventory page instead.
SET @now = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z');

INSERT INTO medicines (name, category, unit, reorder_level, created_at) VALUES
  ('Paracetamol 500mg', 'Analgesic',        'tab',    500, @now),
  ('Amlodipine 5mg',    'Antihypertensive', 'tab',    200, @now),
  ('Sinutret',          'Decongestant',     'tab',    250, @now),
  ('Amoxicillin 500mg', 'Antibiotic',       'cap',    300, @now),
  ('Oral Rehydration',  'Rehydration',      'sachet', 200, @now),
  ('Cetirizine 10mg',   'Antihistamine',    'tab',    200, @now);

INSERT INTO medicine_batches (medicine_id, lot_no, quantity, expiry_date, supplier, date_received, created_at)
SELECT id, CONCAT('SEED-', id),
       CASE name WHEN 'Paracetamol 500mg' THEN 1200 WHEN 'Amlodipine 5mg' THEN 450 WHEN 'Sinutret' THEN 0
                 WHEN 'Amoxicillin 500mg' THEN 80 WHEN 'Oral Rehydration' THEN 50 ELSE 600 END,
       CASE name WHEN 'Paracetamol 500mg' THEN '2027-03-15' WHEN 'Amlodipine 5mg' THEN '2026-09-30'
                 WHEN 'Sinutret' THEN '2026-10-30' WHEN 'Amoxicillin 500mg' THEN '2026-11-20'
                 WHEN 'Oral Rehydration' THEN '2026-10-25' ELSE '2027-06-01' END,
       'Sample data', '2026-10-01', @now
FROM medicines;
