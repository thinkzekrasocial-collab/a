/**
 * Permission catalog — the single source of truth for RBAC.
 *
 * The same catalog is seeded into Cloudflare D1 by
 * `worker/migrations/005_seed_permissions.sql`, and into PostgreSQL by
 * `src/db/seed.ts`.
 */

export interface PermissionDef {
  key: string;
  label: string;
  module: string;
  description?: string;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Machines
  { key: "machine.view", label: "View Machines", module: "Machines", description: "View machine list and machine details" },
  { key: "machine.create", label: "Create Machines", module: "Machines", description: "Add new machines" },
  { key: "machine.edit", label: "Edit Machines", module: "Machines", description: "Update machine details" },
  { key: "machine.delete", label: "Delete Machines", module: "Machines", description: "Remove machines" },
  // Parts
  { key: "part.view", label: "View Parts", module: "Parts", description: "View parts list and current stock" },
  { key: "part.create", label: "Create Parts", module: "Parts", description: "Add new parts" },
  { key: "part.edit", label: "Edit Parts", module: "Parts", description: "Update part details" },
  { key: "part.delete", label: "Delete Parts", module: "Parts", description: "Remove parts" },
  // Inventory
  { key: "stock.in", label: "Stock IN", module: "Inventory", description: "Record stock receipts" },
  { key: "stock.out", label: "Stock OUT", module: "Inventory", description: "Record stock issues" },
  { key: "transaction.view", label: "View Transactions", module: "Inventory", description: "View the stock ledger" },
  // Employees
  { key: "employee.view", label: "View Employees", module: "Employees", description: "View employee records" },
  { key: "employee.create", label: "Create Employees", module: "Employees", description: "Add new employees" },
  { key: "employee.edit", label: "Edit Employees", module: "Employees", description: "Update employee records" },
  { key: "employee.delete", label: "Delete Employees", module: "Employees", description: "Remove employee records" },
  // Reports
  { key: "report.view", label: "View Reports", module: "Reports", description: "Access reports" },
  { key: "report.export", label: "Export Reports", module: "Reports", description: "Download CSV exports" },
  // Users
  { key: "user.view", label: "View Users", module: "Users", description: "View user accounts" },
  { key: "user.create", label: "Create Users", module: "Users", description: "Create user accounts" },
  { key: "user.edit", label: "Edit Users", module: "Users", description: "Edit users and assign roles" },
  { key: "user.disable", label: "Disable Users", module: "Users", description: "Enable / disable accounts" },
  // Administration
  { key: "settings.manage", label: "Manage Settings", module: "Administration", description: "Manage roles & permissions" },
  { key: "audit.view", label: "View Audit Logs", module: "Administration", description: "View the audit trail" },
];

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]["key"];

export function isPermissionKey(value: string): value is PermissionKey {
  return ALL_PERMISSIONS.some((p) => p.key === value);
}

export const PERMISSIONS_BY_MODULE: Record<string, PermissionDef[]> =
  ALL_PERMISSIONS.reduce<Record<string, PermissionDef[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

/** Predefined role templates (seeded at first run). */
export const ROLE_TEMPLATES: {
  name: string;
  description: string;
  isSystem: 1 | 0;
  permissions: PermissionKey[];
}[] = [
  {
    name: "Super Admin",
    description: "Full access to every module.",
    isSystem: 1,
    permissions: ALL_PERMISSIONS.map((p) => p.key),
  },
  {
    name: "Manager",
    description:
      "Manages machines, parts, stock, employees and reports — but not users or system settings.",
    isSystem: 1,
    permissions: [
      "machine.view",
      "machine.create",
      "machine.edit",
      "part.view",
      "part.create",
      "part.edit",
      "stock.in",
      "stock.out",
      "transaction.view",
      "employee.view",
      "employee.create",
      "employee.edit",
      "report.view",
      "report.export",
      "audit.view",
    ],
  },
  {
    name: "Technician",
    description: "Can view machines, parts and stock levels.",
    isSystem: 1,
    permissions: ["machine.view", "part.view", "transaction.view"],
  },
  {
    name: "Viewer",
    description: "Read-only access to dashboard, machines, parts and reports.",
    isSystem: 1,
    permissions: ["machine.view", "part.view", "transaction.view", "report.view"],
  },
];
