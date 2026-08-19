-- =====================================================================
-- 002_business_schema.sql
-- Machine hierarchy + parts + stock ledger + employees.
-- Note: `last_login_at` (users) and `opening_stock` (parts) are added in
-- later patch migrations 009/010 — this mirrors a real project history.
-- =====================================================================

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_name   TEXT NOT NULL,
  unit_code   TEXT NOT NULL UNIQUE,
  location    TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS floors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id      INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  floor_name   TEXT NOT NULL,
  floor_number INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (unit_id, floor_number)
);

CREATE TABLE IF NOT EXISTS machine_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS machines (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_code      TEXT NOT NULL UNIQUE,
  machine_name      TEXT NOT NULL,
  machine_type_id   INTEGER NOT NULL REFERENCES machine_types(id),
  unit_id           INTEGER NOT NULL REFERENCES units(id),
  floor_id          INTEGER NOT NULL REFERENCES floors(id),
  model             TEXT,
  serial_number     TEXT,
  manufacturer      TEXT,
  installation_date TEXT,
  status            TEXT NOT NULL DEFAULT 'Running',
  description       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  part_code        TEXT NOT NULL UNIQUE,
  part_name        TEXT NOT NULL,
  category         TEXT,
  unit_of_measure  TEXT NOT NULL DEFAULT 'PCS',
  supplier         TEXT,
  country_of_origin TEXT,
  minimum_stock    REAL NOT NULL DEFAULT 0,
  description      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id          INTEGER NOT NULL REFERENCES parts(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN','OUT','OPENING')),
  quantity         REAL NOT NULL CHECK (quantity > 0),
  transaction_date TEXT NOT NULL,
  source           TEXT,
  destination      TEXT,
  supplier         TEXT,
  machine_id       INTEGER REFERENCES machines(id),
  reference_number TEXT,
  purpose          TEXT,
  note             TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code       TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  phone               TEXT,
  designation         TEXT,
  department          TEXT,
  joining_date        TEXT,
  current_salary      REAL NOT NULL DEFAULT 0,
  last_increment_date TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
