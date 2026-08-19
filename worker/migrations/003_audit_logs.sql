-- =====================================================================
-- 003_audit_logs.sql
-- Business/official audit trail. Normal users can never delete rows —
-- only the Super Admin can purge old entries (via the API).
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  module      TEXT NOT NULL,
  record_id   TEXT,
  description TEXT,
  metadata    TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
