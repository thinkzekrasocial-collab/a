-- =====================================================================
-- 006_seed_users.sql
-- ⚠️ DEVELOPMENT SEED ACCOUNTS ⚠️
-- Password for ALL four accounts:  Ab123456
-- Passwords are stored as PBKDF2 (SHA-256, 60,000 rounds) hashes — never
-- plaintext. REMOVE OR CHANGE these before production:
--   • superadmin  — full access
--   • manager     — parts/stock focus, no user management
--   • technician  — view only
--   • viewer      — read-only
-- =====================================================================

INSERT INTO users (id, name, username, password_hash, status) VALUES
  (1, 'Super Admin',   'superadmin',
   'pbkdf2$60000$obLD1OX2BxipsMHS4/QFFg==$qhYfrczYfc2XvRHP+bWy60bpXxWe8oOnUXCUlCjKJdc=',
   'active'),
  (2, 'Rahim Uddin',   'manager',
   'pbkdf2$60000$ssPU5fYHGCmwwdLj9AUWJw==$ak8g4JyBCXT3Dm9b+EMa8MX0aigTF0vlw5Yk8sVq+sc=',
   'active'),
  (3, 'Karim Mia',     'technician',
   'pbkdf2$60000$w9Tl5gcYKTrA0eLzpAUWuA==$HQhwzoVwkMw/skCga4+nedUNQA8F8lmu4b/Q7tPG+3g=',
   'active'),
  (4, 'Shakil Ahmed',  'viewer',
   'pbkdf2$60000$1OX2BxgpOkvR4vOkBRa4yQ==$wlkv2QpYRU+WzZb7Q3leaFxQsdwyO8RpMU+vSqm5kew=',
   'active');

INSERT INTO users_roles (user_id, role_id) VALUES
  (1, 1),
  (2, 2),
  (3, 3),
  (4, 4);
