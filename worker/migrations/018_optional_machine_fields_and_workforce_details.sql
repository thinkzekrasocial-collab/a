-- Allow machines to be created without hierarchy assignments and add the
-- fields used by the stock movement and employee screens.

PRAGMA foreign_keys=OFF;

CREATE TABLE machines_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_code      TEXT NOT NULL UNIQUE,
  machine_name      TEXT NOT NULL,
  machine_type_id   INTEGER REFERENCES machine_types(id),
  unit_id           INTEGER REFERENCES units(id),
  floor_id          INTEGER REFERENCES floors(id),
  model             TEXT,
  serial_number     TEXT,
  manufacturer      TEXT,
  installation_date TEXT,
  status            TEXT NOT NULL DEFAULT 'Running',
  description       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO machines_new (
  id, machine_code, machine_name, machine_type_id, unit_id, floor_id,
  model, serial_number, manufacturer, installation_date, status, description,
  created_at, updated_at
)
SELECT id, machine_code, machine_name, machine_type_id, unit_id, floor_id,
       model, serial_number, manufacturer, installation_date, status, description,
       created_at, updated_at
FROM machines;

DROP TABLE machines;
ALTER TABLE machines_new RENAME TO machines;

CREATE INDEX IF NOT EXISTS idx_machines_type_id ON machines(machine_type_id);
CREATE INDEX IF NOT EXISTS idx_machines_unit_id ON machines(unit_id);
CREATE INDEX IF NOT EXISTS idx_machines_floor_id ON machines(floor_id);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);

ALTER TABLE stock_transactions ADD COLUMN received_by TEXT;
ALTER TABLE stock_transactions ADD COLUMN storage_location TEXT;
ALTER TABLE stock_transactions ADD COLUMN issued_by TEXT;
ALTER TABLE stock_transactions ADD COLUMN work_order TEXT;

ALTER TABLE employees ADD COLUMN city TEXT;
ALTER TABLE employees ADD COLUMN offdays_taken INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN offdays_left INTEGER NOT NULL DEFAULT 0;

UPDATE custom_menus
SET columns = '[{"key":"phone","label":"Phone","type":"text"},{"key":"designation","label":"Designation","type":"text"},{"key":"department","label":"Department","type":"text"},{"key":"joining_date","label":"Joining date","type":"date"},{"key":"city","label":"City","type":"text"},{"key":"offdays_taken","label":"Off days taken","type":"number"},{"key":"offdays_left","label":"Off days left","type":"number"}]'
WHERE entity_type = 'employee';

PRAGMA foreign_keys=ON;
