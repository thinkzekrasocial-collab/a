-- =====================================================================
-- 009_add_last_login.sql
-- Patch: add last login tracking to users.
-- =====================================================================

ALTER TABLE users ADD COLUMN last_login_at TEXT;
