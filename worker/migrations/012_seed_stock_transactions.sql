-- =====================================================================
-- 012_seed_stock_transactions.sql
-- Sample IN / OUT history. Expected balances after this file:
--   Afrodul 500 +100 -20 -30 = 550 · Gota Kalappa 160 · Fusing 950
--   Needle 60 (LOW, min 200) · Oil 12 (LOW, min 50) · Timing Belt 0 (OUT)
-- =====================================================================

INSERT INTO stock_transactions
  (part_id, transaction_type, quantity, transaction_date, source, destination, supplier, machine_id, reference_number, purpose, note, created_by)
VALUES
  (1, 'OUT', 20,  '2024-02-10', NULL,              'Unit 1 — 3rd Floor', NULL,              1,  'OUT-1001', 'Production', NULL, 1),
  (1, 'IN',  100, '2024-03-02', 'Bangladesh',      NULL,                 'SS Threads Ltd.', NULL, 'INV-2201', NULL,         NULL, 1),
  (1, 'OUT', 30,  '2024-03-18', NULL,              'Unit 2 — 2nd Floor', NULL,              8,  'OUT-1044', 'Production', NULL, 1),
  (2, 'OUT', 40,  '2024-03-05', NULL,              'Unit 1 — 1st Floor', NULL,              5,  'OUT-1019', 'Decoration', NULL, 1),
  (3, 'OUT', 250, '2024-02-22', NULL,              'Unit 2 — Ground Floor', NULL,           7,  'OUT-1022', 'Production', NULL, 1),
  (4, 'OUT', 90,  '2024-03-12', NULL,              'Unit 1 — 3rd Floor', NULL,              2,  'OUT-1033', 'Replacement', NULL, 1),
  (5, 'OUT', 18,  '2024-03-20', NULL,              'Unit 3 — 1st Floor', NULL,              10, 'OUT-1050', 'Machine maintenance', NULL, 1);
