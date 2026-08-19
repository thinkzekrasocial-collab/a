-- =====================================================================
-- 015_extra_indexes.sql
-- Remaining frequently-searched fields.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
