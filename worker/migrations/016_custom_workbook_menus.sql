-- Custom superadmin menus and per-record workbook data.
CREATE TABLE IF NOT EXISTS custom_menus (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('employee', 'part')),
  icon        TEXT NOT NULL DEFAULT '📋',
  description TEXT,
  columns     TEXT NOT NULL DEFAULT '[]',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_sheet_data (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id     INTEGER NOT NULL REFERENCES custom_menus(id) ON DELETE CASCADE,
  entity_id   INTEGER NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(menu_id, entity_id)
);

CREATE INDEX IF NOT EXISTS custom_menus_sort_idx ON custom_menus(sort_order, id);
CREATE INDEX IF NOT EXISTS menu_sheet_data_menu_idx ON menu_sheet_data(menu_id, entity_id);

INSERT OR IGNORE INTO custom_menus (name, slug, entity_type, icon, description, columns, sort_order, created_by)
VALUES
  ('Employees Workbook', 'employees-workbook', 'employee', '👷', 'One spreadsheet-style workbook for every employee.', '[{"key":"phone","label":"Phone","type":"text"},{"key":"designation","label":"Designation","type":"text"},{"key":"department","label":"Department","type":"text"},{"key":"joining_date","label":"Joining date","type":"date"},{"key":"current_salary","label":"Salary","type":"number"}]', 10, 1),
  ('Products Workbook', 'products-workbook', 'part', '🧩', 'One product workbook with a live inventory ledger.', '[{"key":"category","label":"Category","type":"text"},{"key":"supplier","label":"Supplier","type":"text"},{"key":"minimum_stock","label":"Minimum stock","type":"number"}]', 20, 1);
