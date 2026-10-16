-- OPTIONAL TEST DATA: the six sample medicines from the old static inventory page.
-- Safe to run more than once (skips anything already there) and uses no session variables,
-- so it works with migrate scripts that run each statement separately.
-- Do NOT run on a real clinic database. Use "Stock In" on the Inventory page instead.

INSERT IGNORE INTO medicines (name, category, unit, reorder_level, created_at) VALUES
  ('Paracetamol 500mg', 'Analgesic',        'tab',    500, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')),
  ('Amlodipine 5mg',    'Antihypertensive', 'tab',    200, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')),
  ('Sinutret',          'Decongestant',     'tab',    250, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')),
  ('Amoxicillin 500mg', 'Antibiotic',       'cap',    300, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')),
  ('Oral Rehydration',  'Rehydration',      'sachet', 200, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')),
  ('Cetirizine 10mg',   'Antihistamine',    'tab',    200, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'));

INSERT INTO medicine_batches (medicine_id, lot_no, quantity, expiry_date, supplier, date_received, created_at)
SELECT m.id, CONCAT('SEED-', m.id),
       CASE m.name WHEN 'Paracetamol 500mg' THEN 1200 WHEN 'Amlodipine 5mg' THEN 450 WHEN 'Sinutret' THEN 0
                   WHEN 'Amoxicillin 500mg' THEN 80 WHEN 'Oral Rehydration' THEN 50 ELSE 600 END,
       CASE m.name WHEN 'Paracetamol 500mg' THEN '2027-03-15' WHEN 'Amlodipine 5mg' THEN '2026-09-30'
                   WHEN 'Sinutret' THEN '2026-10-30' WHEN 'Amoxicillin 500mg' THEN '2026-11-20'
                   WHEN 'Oral Rehydration' THEN '2026-10-25' ELSE '2027-06-01' END,
       'Sample data', '2026-10-01', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
FROM medicines m
WHERE m.name IN ('Paracetamol 500mg', 'Amlodipine 5mg', 'Sinutret', 'Amoxicillin 500mg', 'Oral Rehydration', 'Cetirizine 10mg')
  AND NOT EXISTS (SELECT 1 FROM medicine_batches b WHERE b.medicine_id = m.id AND b.lot_no = CONCAT('SEED-', m.id));
