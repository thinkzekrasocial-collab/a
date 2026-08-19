-- =====================================================================
-- 008_seed_machines.sql
-- Sample machines across units/floors/types (development data).
-- =====================================================================

INSERT INTO machines
  (id, machine_code, machine_name, machine_type_id, unit_id, floor_id, model, serial_number, manufacturer, installation_date, status)
VALUES
  (1,  'OVR-3F-001', 'Overlock Machine #1',  1, 1, 4, 'JUKI MO-6714S',   'JUKI-OVR-8821',  'JUKI Corporation', '2023-06-15', 'Running'),
  (2,  'OVR-3F-002', 'Overlock Machine #2',  1, 1, 4, 'JUKI MO-6716S',   'JUKI-OVR-8822',  'JUKI Corporation', '2023-06-15', 'Running'),
  (3,  'FIL-3F-001', 'Filling Machine #1',   2, 1, 4, 'PFAFF 360',       'PFAFF-FIL-4011', 'PFAFF',            '2023-06-15', 'Under Maintenance'),
  (4,  'MSK-3F-001', 'Mask Machine #1',      3, 1, 4, 'AutoMask-2000',   'AM-2000-771',    'AutoMask Ltd.',    '2023-06-15', 'Running'),
  (5,  'SEW-1F-001', 'Sewing Machine #1',    4, 1, 2, 'SINGER 4423',     'SING-4423-101',  'SINGER',           '2023-06-15', 'Idle'),
  (6,  'SEW-1F-002', 'Sewing Machine #2',    4, 1, 2, 'SINGER 4423',     'SING-4423-102',  'SINGER',           '2023-06-15', 'Breakdown'),
  (7,  'CUT-GF-001', 'Cutting Machine #1',   5, 2, 5, 'EASTMAN 629',     'EAS-629-77',     'Eastman',          '2023-06-15', 'Running'),
  (8,  'OVR-2F-001', 'Overlock Machine #3',  1, 2, 7, 'JUKI MO-6714S',   'JUKI-OVR-8890',  'JUKI Corporation', '2023-06-15', 'Running'),
  (9,  'OVR-2F-002', 'Overlock Machine #4',  1, 2, 7, 'JUKI MO-6714S',   'JUKI-OVR-8891',  'JUKI Corporation', '2023-06-15', 'Inactive'),
  (10, 'FIL-1F-001', 'Filling Machine #2',   2, 3, 9, 'PFAFF 360',       'PFAFF-FIL-4020', 'PFAFF',            '2023-06-15', 'Running'),
  (11, 'MSK-GF-001', 'Mask Machine #2',      3, 3, 8, 'AutoMask-2000',   'AM-2000-780',    'AutoMask Ltd.',    '2023-06-15', 'Running'),
  (12, 'SEW-GF-001', 'Sewing Machine #3',    4, 4, 10, 'SINGER 4423',    'SING-4423-110',  'SINGER',           '2023-06-15', 'Running');
