-- =====================================================================
-- 004_indexes.sql
-- Frequently searched fields. Unique codes already have implicit indexes
-- (SQLite creates an index for UNIQUE columns automatically).
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_machines_unit_id   ON machines(unit_id);
CREATE INDEX IF NOT EXISTS idx_machines_floor_id  ON machines(floor_id);
CREATE INDEX IF NOT EXISTS idx_machines_type_id   ON machines(machine_type_id);
CREATE INDEX IF NOT EXISTS idx_machines_status    ON machines(status);
CREATE INDEX IF NOT EXISTS idx_parts_name         ON parts(part_name);
CREATE INDEX IF NOT EXISTS idx_tx_part_id         ON stock_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_tx_date            ON stock_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_type            ON stock_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_tx_created_by      ON stock_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_created_at   ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_module       ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_floors_unit        ON floors(unit_id);
