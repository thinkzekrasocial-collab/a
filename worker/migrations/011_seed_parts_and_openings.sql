-- =====================================================================
-- 011_seed_parts_and_openings.sql
-- Sample parts with opening balances. Every non-zero opening balance is
-- also written into the ledger as an OPENING transaction so the full
-- history is visible in the transaction report.
-- =====================================================================

INSERT INTO parts
  (id, part_code, part_name, category, unit_of_measure, supplier, country_of_origin, minimum_stock, opening_stock, description)
VALUES
  (1, 'PRT-001', 'Afrodul',           'Thread',      'PCS',   'SS Threads Ltd.',    'China',        100, 500,  'Main sewing thread'),
  (2, 'PRT-002', 'Gota Kalappa',      'Decoration',  'PCS',   'Deco Trade',         'India',        50,  200,  'Decorative embellishment'),
  (3, 'PRT-003', 'Fusing Interlining','Interlining', 'Meter', 'Texbond Co.',        'South Korea',  300, 1200, 'Fusible interlining fabric'),
  (4, 'PRT-004', 'Needle DBx1',       'Needles',     'PCS',   'Organ Needle',       'Japan',        200, 150,  'Industrial machine needles'),
  (5, 'PRT-005', 'Sewing Oil (5L)',   'Lubricant',   'Liter', 'LubeX Bangladesh',   'Bangladesh',   50,  30,   'Machine lubricating oil'),
  (6, 'PRT-006', 'Timing Belt',       'Spare Parts', 'PCS',   'Machine Parts BD',   'Taiwan',       20,  0,    'Drive belt for motor');

INSERT INTO stock_transactions
  (part_id, transaction_type, quantity, transaction_date, note, created_by)
SELECT id, 'OPENING', opening_stock, '2024-01-01', 'Opening balance', 1
FROM parts WHERE opening_stock > 0;
