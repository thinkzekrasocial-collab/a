-- National ID number for each employee.

ALTER TABLE employees ADD COLUMN nid_number TEXT;

-- Add the field to existing employee workbooks without removing any custom
-- columns the administrator may already have configured.
UPDATE custom_menus
SET columns = substr(columns, 1, length(columns) - 1) || ',{"key":"nid_number","label":"NID number","type":"text"}]'
WHERE entity_type = 'employee'
  AND columns NOT LIKE '%"nid_number"%'
  AND substr(trim(columns), -1) = ']';
