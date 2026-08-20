-- Individual machine inventory movements. A machine with no movement is
-- treated as available; the latest movement determines availability.

CREATE TABLE IF NOT EXISTS machine_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id       INTEGER NOT NULL REFERENCES machines(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN','OUT')),
  transaction_date TEXT NOT NULL,
  source           TEXT,
  destination      TEXT,
  customer         TEXT,
  reason           TEXT,
  sale_price       REAL,
  reference_number TEXT,
  note             TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_machine_tx_machine_id ON machine_transactions(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_tx_date ON machine_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_machine_tx_type ON machine_transactions(transaction_type);
