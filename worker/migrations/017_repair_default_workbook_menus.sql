-- Repair default workbook menus for databases where migration 016 was marked
-- applied but its seed rows were not present. This is intentionally
-- idempotent so it is safe to run against an existing production database.
INSERT OR IGNORE INTO custom_menus
  (name, slug, entity_type, icon, description, columns, sort_order, created_by)
VALUES
  (
    'Employees Workbook',
    'employees-workbook',
    'employee',
    '👷',
    'One spreadsheet-style workbook for every employee.',
    '[{"key":"phone","label":"Phone","type":"text"},{"key":"designation","label":"Designation","type":"text"},{"key":"department","label":"Department","type":"text"},{"key":"joining_date","label":"Joining date","type":"date"},{"key":"current_salary","label":"Salary","type":"number"}]',
    10,
    1
  ),
  (
    'Products Workbook',
    'products-workbook',
    'part',
    '🧩',
    'One product workbook with a live inventory ledger.',
    '[{"key":"category","label":"Category","type":"text"},{"key":"supplier","label":"Supplier","type":"text"},{"key":"minimum_stock","label":"Minimum stock","type":"number"}]',
    20,
    1
  );
