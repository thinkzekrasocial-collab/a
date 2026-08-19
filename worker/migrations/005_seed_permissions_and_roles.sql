-- =====================================================================
-- 005_seed_permissions_and_roles.sql
-- Permission catalog + the 4 system roles (Super Admin, Manager,
-- Technician, Viewer). This is the same catalog the app's permission
-- picker displays.
-- =====================================================================

-- ---------- Permissions (module, key, label) ----------
INSERT INTO permissions (id, key, label, module, description) VALUES
  (1,  'machine.view',     'View Machines',     'Machines',       'View machine list and machine details'),
  (2,  'machine.create',   'Create Machines',   'Machines',       'Add new machines'),
  (3,  'machine.edit',     'Edit Machines',     'Machines',       'Update machine details'),
  (4,  'machine.delete',   'Delete Machines',   'Machines',       'Remove machines'),
  (5,  'part.view',        'View Parts',        'Parts',          'View parts list and current stock'),
  (6,  'part.create',      'Create Parts',      'Parts',          'Add new parts'),
  (7,  'part.edit',        'Edit Parts',        'Parts',          'Update part details'),
  (8,  'part.delete',      'Delete Parts',      'Parts',          'Remove parts'),
  (9,  'stock.in',         'Stock IN',          'Inventory',      'Record stock receipts'),
  (10, 'stock.out',        'Stock OUT',         'Inventory',      'Record stock issues'),
  (11, 'transaction.view', 'View Transactions', 'Inventory',      'View the stock ledger'),
  (12, 'employee.view',    'View Employees',    'Employees',      'View employee records'),
  (13, 'employee.create',  'Create Employees',  'Employees',      'Add new employees'),
  (14, 'employee.edit',    'Edit Employees',    'Employees',      'Update employee records'),
  (15, 'employee.delete',  'Delete Employees',  'Employees',      'Remove employee records'),
  (16, 'report.view',      'View Reports',      'Reports',        'Access reports'),
  (17, 'report.export',    'Export Reports',    'Reports',        'Download CSV exports'),
  (18, 'user.view',        'View Users',        'Users',          'View user accounts'),
  (19, 'user.create',      'Create Users',      'Users',          'Create user accounts'),
  (20, 'user.edit',        'Edit Users',        'Users',          'Edit users and assign roles'),
  (21, 'user.disable',     'Disable Users',     'Users',          'Enable / disable accounts'),
  (22, 'settings.manage',  'Manage Settings',   'Administration', 'Manage roles & permissions'),
  (23, 'audit.view',       'View Audit Logs',   'Administration', 'View the audit trail');

-- ---------- Roles ----------
INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'Super Admin', 'Full access to every module.', 1),
  (2, 'Manager', 'Manages machines, parts, stock, employees and reports — but not users or system settings.', 1),
  (3, 'Technician', 'Can view machines, parts and stock levels.', 1),
  (4, 'Viewer', 'Read-only access to dashboard, machines, parts and reports.', 1);

-- ---------- Super Admin: everything ----------
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- ---------- Manager ----------
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (2, 1), (2, 2), (2, 3),           -- machines view/create/edit
  (2, 5), (2, 6), (2, 7),           -- parts view/create/edit
  (2, 9), (2, 10), (2, 11),         -- stock in/out + transactions
  (2, 12), (2, 13), (2, 14),        -- employees view/create/edit
  (2, 16), (2, 17),                 -- reports view/export
  (2, 23);                          -- audit view

-- ---------- Technician: read-only machines/parts/ledger ----------
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (3, 1), (3, 5), (3, 11);

-- ---------- Viewer: read-only incl. reports ----------
INSERT INTO role_permissions (role_id, permission_id) VALUES
  (4, 1), (4, 5), (4, 11), (4, 16);
