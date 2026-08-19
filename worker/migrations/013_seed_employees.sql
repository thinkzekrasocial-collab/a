-- =====================================================================
-- 013_seed_employees.sql
-- Sample employee records (development data).
-- =====================================================================

INSERT INTO employees
  (id, employee_code, name, phone, designation, department, joining_date, current_salary, last_increment_date, status)
VALUES
  (1, 'EMP-001', 'Md. Rafiq Islam', '01711-000001', 'Floor Supervisor',      'Production',  '2019-03-01', 28000, '2023-07-01', 'active'),
  (2, 'EMP-002', 'Sultana Begum',   '01711-000002', 'Quality Inspector',     'Quality',     '2020-05-15', 22000, '2023-07-01', 'active'),
  (3, 'EMP-003', 'Jasim Uddin',     '01711-000003', 'Machine Operator',      'Production',  '2021-01-10', 16500, '2023-07-01', 'active'),
  (4, 'EMP-004', 'Nusrat Jahan',    '01711-000004', 'Store Keeper',          'Stores',      '2018-11-20', 24000, '2023-01-01', 'active'),
  (5, 'EMP-005', 'Alam Hossain',    '01711-000005', 'Maintenance Technician','Maintenance', '2017-06-01', 26000, '2024-01-01', 'active'),
  (6, 'EMP-006', 'Rina Akter',      '01711-000006', 'Helper',                'Production',  '2022-02-01', 12000, '2023-07-01', 'inactive');
