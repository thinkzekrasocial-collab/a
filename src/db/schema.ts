import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * AB Maintenance BD — normalized schema.
 *
 * Every table here has an exact twin in the Cloudflare D1 (SQLite) migration
 * files under `worker/migrations/`. Column names intentionally use snake_case
 * so the SQL written for D1 carries over 1:1.
 */

// ---------------------------------------------------------------------------
// Auth & RBAC
// ---------------------------------------------------------------------------

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: integer("is_system").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roles_name_unique").on(t.name)]
);

export const permissions = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    module: text("module").notNull(),
    description: text("description"),
  },
  (t) => [uniqueIndex("permissions_key_unique").on(t.key)]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_unique").on(t.username)]
);

export const usersRoles = pgTable(
  "users_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })]
);

// ---------------------------------------------------------------------------
// Machine hierarchy
// ---------------------------------------------------------------------------

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    unitName: text("unit_name").notNull(),
    unitCode: text("unit_code").notNull(),
    location: text("location"),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("units_unit_code_unique").on(t.unitCode)]
);

export const floors = pgTable(
  "floors",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    floorName: text("floor_name").notNull(),
    floorNumber: integer("floor_number").notNull().default(0),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("floors_unit_number_unique").on(t.unitId, t.floorNumber),
    index("floors_unit_id_idx").on(t.unitId),
  ]
);

export const machineTypes = pgTable(
  "machine_types",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("machine_types_name_unique").on(t.name),
    uniqueIndex("machine_types_code_unique").on(t.code),
  ]
);

export const machines = pgTable(
  "machines",
  {
    id: serial("id").primaryKey(),
    machineCode: text("machine_code").notNull(),
    machineName: text("machine_name").notNull(),
    machineTypeId: integer("machine_type_id")
      .notNull()
      .references(() => machineTypes.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    floorId: integer("floor_id")
      .notNull()
      .references(() => floors.id),
    model: text("model"),
    serialNumber: text("serial_number"),
    manufacturer: text("manufacturer"),
    installationDate: date("installation_date"),
    status: text("status").notNull().default("Running"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("machines_machine_code_unique").on(t.machineCode),
    index("machines_unit_id_idx").on(t.unitId),
    index("machines_floor_id_idx").on(t.floorId),
    index("machines_type_id_idx").on(t.machineTypeId),
    index("machines_status_idx").on(t.status),
  ]
);

// ---------------------------------------------------------------------------
// Parts & inventory ledger
// ---------------------------------------------------------------------------

export const parts = pgTable(
  "parts",
  {
    id: serial("id").primaryKey(),
    partCode: text("part_code").notNull(),
    partName: text("part_name").notNull(),
    category: text("category"),
    unitOfMeasure: text("unit_of_measure").notNull().default("PCS"),
    supplier: text("supplier"),
    countryOfOrigin: text("country_of_origin"),
    minimumStock: numeric("minimum_stock", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    // Opening balance is recorded once and mirrored into an OPENING ledger
    // entry. The live balance is ALWAYS derived from the ledger.
    openingStock: numeric("opening_stock", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("parts_part_code_unique").on(t.partCode),
    index("parts_part_name_idx").on(t.partName),
  ]
);

export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id: serial("id").primaryKey(),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id),
    transactionType: text("transaction_type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    source: text("source"),
    destination: text("destination"),
    supplier: text("supplier"),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "set null",
    }),
    referenceNumber: text("reference_number"),
    purpose: text("purpose"),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stock_tx_part_id_idx").on(t.partId),
    index("stock_tx_date_idx").on(t.transactionDate),
    index("stock_tx_type_idx").on(t.transactionType),
    index("stock_tx_created_by_idx").on(t.createdBy),
  ]
);

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    employeeCode: text("employee_code").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    designation: text("designation"),
    department: text("department"),
    joiningDate: date("joining_date"),
    currentSalary: numeric("current_salary", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    lastIncrementDate: date("last_increment_date"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("employees_employee_code_unique").on(t.employeeCode),
    index("employees_department_idx").on(t.department),
    index("employees_name_idx").on(t.name),
  ]
);

// ---------------------------------------------------------------------------
// Custom menus & per-record workbooks
// ---------------------------------------------------------------------------

export const customMenus = pgTable(
  "custom_menus",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    entityType: text("entity_type").notNull(),
    icon: text("icon").notNull().default("📋"),
    description: text("description"),
    columns: text("columns").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active").notNull().default(1),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("custom_menus_slug_unique").on(t.slug), index("custom_menus_sort_idx").on(t.sortOrder)]
);

export const menuSheetData = pgTable(
  "menu_sheet_data",
  {
    id: serial("id").primaryKey(),
    menuId: integer("menu_id")
      .notNull()
      .references(() => customMenus.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").notNull(),
    data: text("data").notNull().default("{}"),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("menu_sheet_data_menu_entity_unique").on(t.menuId, t.entityId)]
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    module: text("module").notNull(),
    recordId: text("record_id"),
    description: text("description"),
    metadata: text("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_module_idx").on(t.module),
    index("audit_logs_user_id_idx").on(t.userId),
  ]
);
