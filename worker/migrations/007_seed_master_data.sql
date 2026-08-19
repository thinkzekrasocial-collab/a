-- =====================================================================
-- 007_seed_master_data.sql
-- Units, floors and machine types (development sample data).
-- =====================================================================

INSERT INTO units (id, unit_name, unit_code, location, description, status) VALUES
  (1, 'Unit 1', 'U-01', 'Gazipur, Dhaka',   'Main production unit',    'active'),
  (2, 'Unit 2', 'U-02', 'Savar, Dhaka',     'Export processing unit',  'active'),
  (3, 'Unit 3', 'U-03', 'Tongi, Gazipur',   'Finishing unit',          'active'),
  (4, 'Unit 4', 'U-04', 'Narayanganj',      'Packing & dispatch',      'active');

INSERT INTO floors (id, unit_id, floor_name, floor_number, description) VALUES
  (1,  1, 'Ground Floor', 0, NULL),
  (2,  1, '1st Floor',    1, NULL),
  (3,  1, '2nd Floor',    2, NULL),
  (4,  1, '3rd Floor',    3, NULL),
  (5,  2, 'Ground Floor', 0, NULL),
  (6,  2, '1st Floor',    1, NULL),
  (7,  2, '2nd Floor',    2, NULL),
  (8,  3, 'Ground Floor', 0, NULL),
  (9,  3, '1st Floor',    1, NULL),
  (10, 4, 'Ground Floor', 0, NULL);

INSERT INTO machine_types (id, name, code, description) VALUES
  (1, 'Overlock', 'OVR', 'Overlock stitching machine'),
  (2, 'Filling',  'FIL', 'Filling machine'),
  (3, 'Mask',     'MSK', 'Mask production machine'),
  (4, 'Sewing',   'SEW', 'Industrial sewing machine'),
  (5, 'Cutting',  'CUT', 'Fabric cutting machine');
