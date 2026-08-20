/**
 * AB Maintenance BD — all API endpoints for Cloudflare Workers + D1.
 *
 * Every protected endpoint validates the session AND the permission
 * server-side. Hiding a button in the UI is never enough.
 */

import {
  HttpError,
  Router,
  errorResponse,
  json,
  type Ctx,
  type Env,
} from "./router";
import {
  SESSION_COOKIE,
  hashPassword,
  signSessionToken,
  verifyPassword,
  type SessionUser,
} from "./auth";
import { all, one, run, tx } from "./db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MACHINE_STATUSES = ["Running", "Idle", "Under Maintenance", "Breakdown", "Inactive"];
const UOMS = ["PCS", "KG", "Meter", "Box", "Set", "Liter", "Other"];
const SUPER_ADMIN_ROLE_ID = 1;

const PERMISSIONS = [
  { key: "machine.view", label: "View Machines", module: "Machines", description: "View machine list and machine details" },
  { key: "machine.create", label: "Create Machines", module: "Machines", description: "Add new machines" },
  { key: "machine.edit", label: "Edit Machines", module: "Machines", description: "Update machine details" },
  { key: "machine.delete", label: "Delete Machines", module: "Machines", description: "Remove machines" },
  { key: "part.view", label: "View Parts", module: "Parts", description: "View parts list and current stock" },
  { key: "part.create", label: "Create Parts", module: "Parts", description: "Add new parts" },
  { key: "part.edit", label: "Edit Parts", module: "Parts", description: "Update part details" },
  { key: "part.delete", label: "Delete Parts", module: "Parts", description: "Remove parts" },
  { key: "stock.in", label: "Stock IN", module: "Inventory", description: "Record stock receipts" },
  { key: "stock.out", label: "Stock OUT", module: "Inventory", description: "Record stock issues" },
  { key: "transaction.view", label: "View Transactions", module: "Inventory", description: "View the stock ledger" },
  { key: "employee.view", label: "View Employees", module: "Employees", description: "View employee records" },
  { key: "employee.create", label: "Create Employees", module: "Employees", description: "Add new employees" },
  { key: "employee.edit", label: "Edit Employees", module: "Employees", description: "Update employee records" },
  { key: "employee.delete", label: "Delete Employees", module: "Employees", description: "Remove employee records" },
  { key: "report.view", label: "View Reports", module: "Reports", description: "Access reports" },
  { key: "report.export", label: "Export Reports", module: "Reports", description: "Download CSV exports" },
  { key: "user.view", label: "View Users", module: "Users", description: "View user accounts" },
  { key: "user.create", label: "Create Users", module: "Users", description: "Create user accounts" },
  { key: "user.edit", label: "Edit Users", module: "Users", description: "Edit users and assign roles" },
  { key: "user.disable", label: "Disable Users", module: "Users", description: "Enable / disable accounts" },
  { key: "settings.manage", label: "Manage Settings", module: "Administration", description: "Manage roles & permissions" },
  { key: "audit.view", label: "View Audit Logs", module: "Administration", description: "View the audit trail" },
];

// ---------------------------------------------------------------------------
// Helpers: guards, validation, cookies, audit
// ---------------------------------------------------------------------------

function requirePerm(user: SessionUser | null, permission: string): SessionUser {
  if (!user) throw new HttpError(401, "Authentication required.");
  if (!user.permissions.includes(permission)) {
    throw new HttpError(403, "You do not have permission to perform this action.");
  }
  return user;
}

function isSuperAdmin(user: SessionUser): boolean {
  return user.roles.includes("Super Admin");
}

async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function reqString(v: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(400, `${field} is required.`);
  }
  const s = v.trim();
  if (opts.min && s.length < opts.min) {
    throw new HttpError(400, `${field} must be at least ${opts.min} characters.`);
  }
  if (opts.max && s.length > opts.max) {
    throw new HttpError(400, `${field} must be at most ${opts.max} characters.`);
  }
  return s;
}

function optString(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new HttpError(400, "Invalid text value.");
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `Text is too long (max ${max}).`);
  return s === "" ? undefined : s;
}

function reqInt(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${field} must be a valid ID.`);
  return n;
}

function optInt(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${field} must be a valid ID.`);
  return n;
}

function isDateStr(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
}

function reqDate(v: unknown, field: string): string {
  if (!isDateStr(v)) throw new HttpError(400, `${field} must be a valid date (YYYY-MM-DD).`);
  return v;
}

function optDate(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return reqDate(v, field);
}

function reqPosNumber(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HttpError(400, `${field} must be a number greater than zero.`);
  }
  return n;
}

function optNonNeg(v: unknown, field: string, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, `${field} must be a number greater than or equal to zero.`);
  }
  return n;
}

function optNonNegInt(v: unknown, field: string, fallback: number): number {
  const n = optNonNeg(v, field, fallback);
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number.`);
  return n;
}

function paginate(query: URLSearchParams): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.get("limit") ?? "10", 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

async function audit(
  env: Env,
  entry: {
    userId?: number | null;
    action: string;
    module: string;
    recordId?: string | number | null;
    description?: string | null;
    metadata?: unknown;
    ip?: string | null;
  }
): Promise<void> {
  try {
    await run(
      env.DB,
      `insert into audit_logs (user_id, action, module, record_id, description, metadata, ip)
       values (?, ?, ?, ?, ?, ?, ?)`,
      entry.userId ?? null,
      entry.action,
      entry.module,
      entry.recordId != null ? String(entry.recordId) : null,
      entry.description ?? null,
      entry.metadata != null ? JSON.stringify(entry.metadata) : null,
      entry.ip ?? null
    );
  } catch (e) {
    console.error("[audit] failed:", e);
  }
}

function setSessionCookie(res: Response, token: string): Response {
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`
  );
  return res;
}

function clearSessionCookie(res: Response): Response {
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
  return res;
}

async function exists(env: Env, table: string, id: number): Promise<boolean> {
  // table names come from a fixed allow-list in callers only.
  const row = await one<{ n: number }>(
    env.DB,
    `select 1 as n from ${table} where id = ? limit 1`,
    id
  );
  return !!row;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function login(req: Request, env: Env): Promise<Response> {
  const body = await readBody<{ username?: unknown; password?: unknown }>(req);
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    throw new HttpError(400, "Username and password are required.");
  }

  const user = await one<{
    id: number;
    name: string;
    username: string;
    password_hash: string;
    status: string;
    roles: string | null;
    permissions: string | null;
  }>(
    env.DB,
    `select
       u.id, u.name, u.username, u.password_hash, u.status,
       (select group_concat(r.name, '|') from roles r
          join users_roles ur on ur.role_id = r.id where ur.user_id = u.id) as roles,
       (select group_concat(p.key, '|') from permissions p
          join role_permissions rp on rp.permission_id = p.id
          join users_roles ur2 on ur2.role_id = rp.role_id where ur2.user_id = u.id) as permissions
     from users u where u.username = ?`,
    username
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await audit(env, {
      userId: user?.id ?? null,
      action: "Login failed",
      module: "Auth",
      description: `Failed login attempt for username "${username}".`,
    });
    throw new HttpError(401, "Invalid login credentials.");
  }
  if (user.status !== "active") {
    throw new HttpError(403, "Your account is disabled. Please contact the administrator.");
  }

  await run(env.DB, `update users set last_login_at = datetime('now') where id = ?`, user.id);

  const session: SessionUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    roles: user.roles ? user.roles.split("|") : [],
    permissions: user.permissions ? user.permissions.split("|") : [],
  };

  await audit(env, {
    userId: user.id,
    action: "Login",
    module: "Auth",
    description: `User "${user.username}" logged in.`,
    ip: clientIp(req),
  });

  const token = await signSessionToken(user.id, env.AUTH_SECRET || "dev-only-insecure-secret-change-me");
  return setSessionCookie(json({ user: session }), token);
}

async function logout(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  if (user) {
    await audit(env, {
      userId: user.id,
      action: "Logout",
      module: "Auth",
      description: `User "${user.username}" logged out.`,
    });
  }
  return clearSessionCookie(json({ ok: true }));
}

function me(user: SessionUser | null): Response {
  if (!user) return json({ error: "Authentication required." }, 401);
  return json({ user });
}

// ---------------------------------------------------------------------------
// Units / Floors / Machine types
// ---------------------------------------------------------------------------

async function listUnits(env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "machine.view");
  const rows = await all(env.DB, `select u.*,
      (select count(*) from machines m where m.unit_id = u.id) as machine_count,
      (select count(*) from floors f where f.unit_id = u.id) as floor_count
    from units u order by u.id asc`);
  return json({ items: rows });
}

async function createUnit(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "machine.create");
  const b = await readBody<Record<string, unknown>>(req);
  const unitName = reqString(b.unit_name, "Unit name", { max: 120 });
  const unitCode = reqString(b.unit_code, "Unit code", { max: 40 });
  const status = b.status === "inactive" ? "inactive" : "active";

  const dup = await one(env.DB, `select 1 as n from units where unit_code = ?`, unitCode);
  if (dup) throw new HttpError(409, "A unit with this code already exists.");

  const result = (await run(
    env.DB,
    `insert into units (unit_name, unit_code, location, description, status) values (?, ?, ?, ?, ?)`,
    unitName,
    unitCode,
    optString(b.location) ?? null,
    optString(b.description, 2000) ?? null,
    status
  )) as { meta?: { last_row_id?: number } };

  const id = result.meta?.last_row_id;
  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Unit",
    recordId: id,
    description: `Unit "${unitName}" (${unitCode}) created.`,
  });
  return json({ item: { id, unit_name: unitName, unit_code: unitCode, status } }, 201);
}

async function updateUnit(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.edit");
  const id = reqInt(ctx.params.id, "Unit ID");
  if (!(await exists(env, "units", id))) throw new HttpError(404, "Unit not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const unitName = reqString(b.unit_name, "Unit name", { max: 120 });
  const unitCode = reqString(b.unit_code, "Unit code", { max: 40 });
  const status = b.status === "inactive" ? "inactive" : "active";

  const dup = await one(env.DB, `select 1 as n from units where unit_code = ? and id != ?`, unitCode, id);
  if (dup) throw new HttpError(409, "A unit with this code already exists.");

  await run(
    env.DB,
    `update units set unit_name = ?, unit_code = ?, location = ?, description = ?, status = ?, updated_at = datetime('now') where id = ?`,
    unitName,
    unitCode,
    optString(b.location) ?? null,
    optString(b.description, 2000) ?? null,
    status,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Unit",
    recordId: id,
    description: `Unit "${unitName}" (${unitCode}) updated.`,
  });
  return json({ item: { id, unit_name: unitName, unit_code: unitCode, status } });
}

async function deleteUnit(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.delete");
  const id = reqInt(ctx.params.id, "Unit ID");
  const row = await one<{ unit_name: string }>(env.DB, `select unit_name from units where id = ?`, id);
  if (!row) throw new HttpError(404, "Unit not found.");

  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from machines where unit_id = ?`,
    id
  );
  if ((count?.n ?? 0) > 0) {
    throw new HttpError(409, "Unit cannot be deleted because machines are assigned to it.");
  }

  await run(env.DB, `delete from units where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Unit",
    recordId: id,
    description: `Unit "${row.unit_name}" deleted.`,
  });
  return json({ ok: true });
}

async function listFloors(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "machine.view");
  const url = new URL(req.url);
  const unitId = optInt(url.searchParams.get("unit_id"), "Unit ID");
  const rows = await all(
    env.DB,
    `select f.*, u.unit_name,
        (select count(*) from machines m where m.floor_id = f.id) as machine_count
     from floors f join units u on u.id = f.unit_id
     ${unitId ? "where f.unit_id = ?" : ""}
     order by f.unit_id asc, f.floor_number asc`,
    ...(unitId ? [unitId] : [])
  );
  return json({ items: rows });
}

async function createFloor(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "machine.create");
  const b = await readBody<Record<string, unknown>>(req);
  const unitId = reqInt(b.unit_id, "Unit");
  const floorName = reqString(b.floor_name, "Floor name", { max: 120 });
  const floorNumber = Number(b.floor_number);
  if (!Number.isInteger(floorNumber) || floorNumber < 0) {
    throw new HttpError(400, "Floor number must be a non-negative whole number.");
  }
  if (!(await exists(env, "units", unitId))) throw new HttpError(404, "Unit not found.");
  const dup = await one(
    env.DB,
    `select 1 as n from floors where unit_id = ? and floor_number = ?`,
    unitId,
    floorNumber
  );
  if (dup) throw new HttpError(409, "This floor number already exists in the selected unit.");

  const result = (await run(
    env.DB,
    `insert into floors (unit_id, floor_name, floor_number, description) values (?, ?, ?, ?)`,
    unitId,
    floorName,
    floorNumber,
    optString(b.description) ?? null
  )) as { meta?: { last_row_id?: number } };

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Floor",
    recordId: result.meta?.last_row_id,
    description: `Floor "${floorName}" created in unit #${unitId}.`,
  });
  return json({ item: { id: result.meta?.last_row_id, unit_id: unitId, floor_name: floorName, floor_number: floorNumber } }, 201);
}

async function updateFloor(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.edit");
  const id = reqInt(ctx.params.id, "Floor ID");
  if (!(await exists(env, "floors", id))) throw new HttpError(404, "Floor not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const unitId = reqInt(b.unit_id, "Unit");
  const floorName = reqString(b.floor_name, "Floor name", { max: 120 });
  const floorNumber = Number(b.floor_number);
  if (!Number.isInteger(floorNumber) || floorNumber < 0) {
    throw new HttpError(400, "Floor number must be a non-negative whole number.");
  }
  if (!(await exists(env, "units", unitId))) throw new HttpError(404, "Unit not found.");
  const dup = await one(
    env.DB,
    `select 1 as n from floors where unit_id = ? and floor_number = ? and id != ?`,
    unitId,
    floorNumber,
    id
  );
  if (dup) throw new HttpError(409, "This floor number already exists in the selected unit.");

  await run(
    env.DB,
    `update floors set unit_id = ?, floor_name = ?, floor_number = ?, description = ?, updated_at = datetime('now') where id = ?`,
    unitId,
    floorName,
    floorNumber,
    optString(b.description) ?? null,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Floor",
    recordId: id,
    description: `Floor "${floorName}" updated.`,
  });
  return json({ item: { id, unit_id: unitId, floor_name: floorName, floor_number: floorNumber } });
}

async function deleteFloor(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.delete");
  const id = reqInt(ctx.params.id, "Floor ID");
  const row = await one<{ floor_name: string }>(env.DB, `select floor_name from floors where id = ?`, id);
  if (!row) throw new HttpError(404, "Floor not found.");

  const count = await one<{ n: number }>(env.DB, `select count(*) as n from machines where floor_id = ?`, id);
  if ((count?.n ?? 0) > 0) {
    throw new HttpError(409, "Floor cannot be deleted because machines are assigned to it.");
  }

  await run(env.DB, `delete from floors where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Floor",
    recordId: id,
    description: `Floor "${row.floor_name}" deleted.`,
  });
  return json({ ok: true });
}

async function listMachineTypes(env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "machine.view");
  const rows = await all(
    env.DB,
    `select mt.*, (select count(*) from machines m where m.machine_type_id = mt.id) as machine_count
     from machine_types mt order by mt.name asc`
  );
  return json({ items: rows });
}

async function createMachineType(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "machine.create");
  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Name", { max: 120 });
  const code = reqString(b.code, "Code", { max: 40 });

  const dup = await one(
    env.DB,
    `select 1 as n from machine_types where name = ? or code = ?`,
    name,
    code
  );
  if (dup) throw new HttpError(409, "A machine type with this name or code already exists.");

  const result = (await run(
    env.DB,
    `insert into machine_types (name, code, description) values (?, ?, ?)`,
    name,
    code,
    optString(b.description) ?? null
  )) as { meta?: { last_row_id?: number } };

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Machine Type",
    recordId: result.meta?.last_row_id,
    description: `Machine type "${name}" (${code}) created.`,
  });
  return json({ item: { id: result.meta?.last_row_id, name, code } }, 201);
}

async function updateMachineType(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.edit");
  const id = reqInt(ctx.params.id, "Machine type ID");
  if (!(await exists(env, "machine_types", id))) throw new HttpError(404, "Machine type not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Name", { max: 120 });
  const code = reqString(b.code, "Code", { max: 40 });

  const dup = await one(
    env.DB,
    `select 1 as n from machine_types where (name = ? or code = ?) and id != ?`,
    name,
    code,
    id
  );
  if (dup) throw new HttpError(409, "A machine type with this name or code already exists.");

  await run(
    env.DB,
    `update machine_types set name = ?, code = ?, description = ?, updated_at = datetime('now') where id = ?`,
    name,
    code,
    optString(b.description) ?? null,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Machine Type",
    recordId: id,
    description: `Machine type "${name}" (${code}) updated.`,
  });
  return json({ item: { id, name, code } });
}

async function deleteMachineType(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.delete");
  const id = reqInt(ctx.params.id, "Machine type ID");
  const row = await one<{ name: string }>(env.DB, `select name from machine_types where id = ?`, id);
  if (!row) throw new HttpError(404, "Machine type not found.");

  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from machines where machine_type_id = ?`,
    id
  );
  if ((count?.n ?? 0) > 0) {
    throw new HttpError(409, "Machine type cannot be deleted because machines are assigned to it.");
  }

  await run(env.DB, `delete from machine_types where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Machine Type",
    recordId: id,
    description: `Machine type "${row.name}" deleted.`,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

async function listMachines(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "machine.view");
  const query = new URL(req.url).searchParams;
  const q = (query.get("q") ?? "").trim();
  const status = query.get("status") ?? "";
  const unitId = optInt(query.get("unit_id"), "Unit ID");
  const floorId = optInt(query.get("floor_id"), "Floor ID");
  const typeId = optInt(query.get("type_id"), "Machine type ID");
  const { page, limit, offset } = paginate(query);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q) {
    conditions.push("(m.machine_code like ? or m.machine_name like ? or coalesce(m.serial_number,'') like ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    conditions.push("m.status = ?");
    params.push(status);
  }
  if (unitId) {
    conditions.push("m.unit_id = ?");
    params.push(unitId);
  }
  if (floorId) {
    conditions.push("m.floor_id = ?");
    params.push(floorId);
  }
  if (typeId) {
    conditions.push("m.machine_type_id = ?");
    params.push(typeId);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await all(
    env.DB,
    `select m.*, mt.name as machine_type_name, u.unit_name, f.floor_name, f.floor_number
     from machines m
     left join machine_types mt on mt.id = m.machine_type_id
     left join units u on u.id = m.unit_id
     left join floors f on f.id = m.floor_id
     ${where}
     order by m.id desc
     limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from machines m ${where}`,
    ...params
  );
  return json({ items: rows, total: count?.n ?? 0, page, limit });
}

async function validateMachineRelations(env: Env, b: Record<string, unknown>) {
  const machineTypeId = optInt(b.machine_type_id, "Machine type");
  const unitId = optInt(b.unit_id, "Unit");
  const floorId = optInt(b.floor_id, "Floor");

  if (machineTypeId !== undefined && !(await exists(env, "machine_types", machineTypeId))) {
    throw new HttpError(404, "Machine type not found.");
  }
  if (unitId !== undefined && !(await exists(env, "units", unitId))) {
    throw new HttpError(404, "Unit not found.");
  }
  if (floorId !== undefined) {
    if (unitId === undefined) throw new HttpError(400, "A unit is required when selecting a floor.");
    const floor = await one(env.DB, `select 1 as n from floors where id = ? and unit_id = ?`, floorId, unitId);
    if (!floor) throw new HttpError(404, "Floor not found in the selected unit.");
  }

  const status = reqString(b.status, "Status");
  if (!MACHINE_STATUSES.includes(status)) throw new HttpError(400, "Invalid machine status.");
  return { machineTypeId, unitId, floorId, status };
}

async function createMachine(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "machine.create");
  const b = await readBody<Record<string, unknown>>(req);
  const machineCode = reqString(b.machine_code, "Machine code", { max: 40 });
  const machineName = reqString(b.machine_name, "Machine name", { max: 120 });
  const { machineTypeId, unitId, floorId, status } = await validateMachineRelations(env, b);

  const dup = await one(env.DB, `select 1 as n from machines where machine_code = ?`, machineCode);
  if (dup) throw new HttpError(409, "A machine with this code already exists.");

  const result = (await run(
    env.DB,
    `insert into machines (machine_code, machine_name, machine_type_id, unit_id, floor_id, model, serial_number, manufacturer, installation_date, status, description)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    machineCode,
    machineName,
    machineTypeId ?? null,
    unitId ?? null,
    floorId ?? null,
    optString(b.model, 120) ?? null,
    optString(b.serial_number, 120) ?? null,
    optString(b.manufacturer, 160) ?? null,
    optDate(b.installation_date, "Installation date") ?? null,
    status,
    optString(b.description, 2000) ?? null
  )) as { meta?: { last_row_id?: number } };

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Machine",
    recordId: result.meta?.last_row_id,
    description: `Machine "${machineName}" (${machineCode}) created.`,
  });
  return json({ item: { id: result.meta?.last_row_id, machine_code: machineCode, machine_name: machineName, status } }, 201);
}

async function updateMachine(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.edit");
  const id = reqInt(ctx.params.id, "Machine ID");
  if (!(await exists(env, "machines", id))) throw new HttpError(404, "Machine not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const machineCode = reqString(b.machine_code, "Machine code", { max: 40 });
  const machineName = reqString(b.machine_name, "Machine name", { max: 120 });
  const { machineTypeId, unitId, floorId, status } = await validateMachineRelations(env, b);

  const dup = await one(env.DB, `select 1 as n from machines where machine_code = ? and id != ?`, machineCode, id);
  if (dup) throw new HttpError(409, "A machine with this code already exists.");

  await run(
    env.DB,
    `update machines set machine_code = ?, machine_name = ?, machine_type_id = ?, unit_id = ?, floor_id = ?,
       model = ?, serial_number = ?, manufacturer = ?, installation_date = ?, status = ?, description = ?,
       updated_at = datetime('now')
     where id = ?`,
    machineCode,
    machineName,
    machineTypeId ?? null,
    unitId ?? null,
    floorId ?? null,
    optString(b.model, 120) ?? null,
    optString(b.serial_number, 120) ?? null,
    optString(b.manufacturer, 160) ?? null,
    optDate(b.installation_date, "Installation date") ?? null,
    status,
    optString(b.description, 2000) ?? null,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Machine",
    recordId: id,
    description: `Machine "${machineName}" (${machineCode}) updated.`,
  });
  return json({ item: { id, machine_code: machineCode, machine_name: machineName, status } });
}

async function deleteMachine(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "machine.delete");
  const id = reqInt(ctx.params.id, "Machine ID");
  const row = await one<{ machine_name: string; machine_code: string }>(
    env.DB,
    `select machine_name, machine_code from machines where id = ?`,
    id
  );
  if (!row) throw new HttpError(404, "Machine not found.");

  await run(env.DB, `delete from machines where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Machine",
    recordId: id,
    description: `Machine "${row.machine_name}" (${row.machine_code}) deleted.`,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

async function listParts(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "part.view");
  const query = new URL(req.url).searchParams;
  const q = (query.get("q") ?? "").trim();
  const category = (query.get("category") ?? "").trim();
  const stock = query.get("stock") ?? "";
  const { page, limit, offset } = paginate(query);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q) {
    conditions.push("(pb.part_code like ? or pb.part_name like ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    conditions.push("pb.category = ?");
    params.push(category);
  }
  if (stock === "low") {
    conditions.push("pb.current_balance < pb.minimum_stock and pb.current_balance > 0");
  } else if (stock === "out") {
    conditions.push("pb.current_balance <= 0");
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await all(
    env.DB,
    `select * from v_part_balance pb ${where} order by pb.part_name asc limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from v_part_balance pb ${where}`,
    ...params
  );
  const categories = await all<{ category: string }>(
    env.DB,
    `select distinct category from parts where category is not null and category != '' order by category`
  );
  return json({
    items: rows,
    total: count?.n ?? 0,
    page,
    limit,
    categories: categories.map((c) => c.category),
  });
}

async function createPart(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "part.create");
  const b = await readBody<Record<string, unknown>>(req);
  const partCode = reqString(b.part_code, "Part code", { max: 40 });
  const partName = reqString(b.part_name, "Part name", { max: 160 });
  const uom = reqString(b.unit_of_measure, "Unit of measure");
  if (!UOMS.includes(uom)) throw new HttpError(400, "Invalid unit of measure.");
  const minimumStock = optNonNeg(b.minimum_stock, "Minimum stock", 0);
  const openingStock = optNonNeg(b.opening_stock, "Opening stock", 0);

  const dup = await one(env.DB, `select 1 as n from parts where part_code = ?`, partCode);
  if (dup) throw new HttpError(409, "A part with this code already exists.");

  const created = await tx(env.DB, async (exec) => {
    const result = (await run(
      exec,
      `insert into parts (part_code, part_name, category, unit_of_measure, supplier, country_of_origin, minimum_stock, opening_stock, description)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      partCode,
      partName,
      optString(b.category, 120) ?? null,
      uom,
      optString(b.supplier, 160) ?? null,
      optString(b.country_of_origin, 120) ?? null,
      minimumStock,
      openingStock,
      optString(b.description, 2000) ?? null
    )) as { meta?: { last_row_id?: number } };
    const partId = result.meta?.last_row_id;
    if (openingStock > 0 && partId) {
      await run(
        exec,
        `insert into stock_transactions (part_id, transaction_type, quantity, transaction_date, note, created_by)
         values (?, 'OPENING', ?, date('now'), 'Opening balance', ?)`,
        partId,
        openingStock,
        session.id
      );
    }
    return partId;
  });

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Part",
    recordId: created,
    description: `Part "${partName}" (${partCode}) created with opening stock ${openingStock} ${uom}.`,
  });
  return json({ item: { id: created, part_code: partCode, part_name: partName, unit_of_measure: uom } }, 201);
}

async function updatePart(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "part.edit");
  const id = reqInt(ctx.params.id, "Part ID");
  const existing = await one<{ opening_stock: number }>(
    env.DB,
    `select opening_stock from parts where id = ?`,
    id
  );
  if (!existing) throw new HttpError(404, "Part not found.");

  const b = await readBody<Record<string, unknown>>(req);
  if (
    b.opening_stock !== undefined &&
    b.opening_stock !== null &&
    b.opening_stock !== "" &&
    Number(b.opening_stock) !== Number(existing.opening_stock)
  ) {
    throw new HttpError(400, "Opening stock cannot be changed after creation. Use Stock IN / OUT instead.");
  }

  const partCode = reqString(b.part_code, "Part code", { max: 40 });
  const partName = reqString(b.part_name, "Part name", { max: 160 });
  const uom = reqString(b.unit_of_measure, "Unit of measure");
  if (!UOMS.includes(uom)) throw new HttpError(400, "Invalid unit of measure.");
  const minimumStock = optNonNeg(b.minimum_stock, "Minimum stock", 0);

  const dup = await one(env.DB, `select 1 as n from parts where part_code = ? and id != ?`, partCode, id);
  if (dup) throw new HttpError(409, "A part with this code already exists.");

  await run(
    env.DB,
    `update parts set part_code = ?, part_name = ?, category = ?, unit_of_measure = ?, supplier = ?,
       country_of_origin = ?, minimum_stock = ?, description = ?, updated_at = datetime('now')
     where id = ?`,
    partCode,
    partName,
    optString(b.category, 120) ?? null,
    uom,
    optString(b.supplier, 160) ?? null,
    optString(b.country_of_origin, 120) ?? null,
    minimumStock,
    optString(b.description, 2000) ?? null,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Part",
    recordId: id,
    description: `Part "${partName}" (${partCode}) updated.`,
  });
  return json({ item: { id, part_code: partCode, part_name: partName, unit_of_measure: uom } });
}

async function deletePart(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "part.delete");
  const id = reqInt(ctx.params.id, "Part ID");
  const row = await one<{ part_name: string; part_code: string }>(
    env.DB,
    `select part_name, part_code from parts where id = ?`,
    id
  );
  if (!row) throw new HttpError(404, "Part not found.");

  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from stock_transactions where part_id = ?`,
    id
  );
  if ((count?.n ?? 0) > 0) {
    throw new HttpError(409, "Part cannot be deleted because stock transactions exist for it.");
  }

  await run(env.DB, `delete from parts where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Part",
    recordId: id,
    description: `Part "${row.part_name}" (${row.part_code}) deleted.`,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Stock IN / OUT — the ledger. Balance is ALWAYS derived, never editable.
// ---------------------------------------------------------------------------

async function stockIn(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "stock.in");
  const b = await readBody<Record<string, unknown>>(req);
  const partId = reqInt(b.part_id, "Part");
  const quantity = reqPosNumber(b.quantity, "Quantity");
  const transactionDate = reqDate(b.transaction_date, "Date");

  const part = await one<{ part_code: string; part_name: string; unit_of_measure: string }>(
    env.DB,
    `select part_code, part_name, unit_of_measure from parts where id = ?`,
    partId
  );
  if (!part) throw new HttpError(404, "Part not found.");

  const result = (await run(
    env.DB,
    `insert into stock_transactions (part_id, transaction_type, quantity, transaction_date, source, supplier, reference_number, note, received_by, storage_location, created_by)
     values (?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    partId,
    quantity,
    transactionDate,
    optString(b.source, 160) ?? null,
    optString(b.supplier, 160) ?? null,
    optString(b.reference_number, 120) ?? null,
    optString(b.note, 2000) ?? null,
    optString(b.received_by, 160) ?? null,
    optString(b.storage_location, 160) ?? null,
    session.id
  )) as { meta?: { last_row_id?: number } };

  await audit(env, {
    userId: session.id,
    action: "Stock IN",
    module: "Inventory",
    recordId: result.meta?.last_row_id,
    description: `Stock IN: +${quantity} ${part.unit_of_measure} of "${part.part_name}" (${part.part_code}).`,
    metadata: { partId, quantity, reference: b.reference_number ?? null },
  });
  return json({ item: { id: result.meta?.last_row_id, transaction_type: "IN", quantity } }, 201);
}

async function stockOut(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "stock.out");
  const b = await readBody<Record<string, unknown>>(req);
  const partId = reqInt(b.part_id, "Part");
  const quantity = reqPosNumber(b.quantity, "Quantity");
  const transactionDate = reqDate(b.transaction_date, "Date");
  const machineId = optInt(b.machine_id, "Machine");

  // Keep the balance read and write on the same D1 session for consistent
  // reads. D1 sessions do not make this callback an application transaction.
  const result = await tx(env.DB, async (exec) => {
    const part = await one<{
      id: number;
      part_code: string;
      part_name: string;
      unit_of_measure: string;
      current_balance: number;
    }>(exec, `select * from v_part_balance where id = ?`, partId);
    if (!part) throw new HttpError(404, "Part not found.");

    if (quantity > part.current_balance) {
      throw new HttpError(
        400,
        `Insufficient stock. Available balance: ${part.current_balance} ${part.unit_of_measure}.`
      );
    }

    if (machineId) {
      const machine = await one(exec, `select 1 as n from machines where id = ?`, machineId);
      if (!machine) throw new HttpError(404, "Machine not found.");
    }

    const inserted = (await run(
      exec,
      `insert into stock_transactions (part_id, transaction_type, quantity, transaction_date, destination, machine_id, purpose, reference_number, note, issued_by, work_order, created_by)
       values (?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      partId,
      quantity,
      transactionDate,
      optString(b.destination, 160) ?? null,
      machineId ?? null,
      optString(b.purpose, 200) ?? null,
      optString(b.reference_number, 120) ?? null,
      optString(b.note, 2000) ?? null,
      optString(b.issued_by, 160) ?? null,
      optString(b.work_order, 160) ?? null,
      session.id
    )) as { meta?: { last_row_id?: number } };
    return { txId: inserted.meta?.last_row_id, part };
  });

  await audit(env, {
    userId: session.id,
    action: "Stock OUT",
    module: "Inventory",
    recordId: result.txId,
    description: `Stock OUT: -${quantity} ${result.part.unit_of_measure} of "${result.part.part_name}" (${result.part.part_code}).`,
    metadata: { partId, quantity, machineId: machineId ?? null, reference: b.reference_number ?? null },
  });
  return json({ item: { id: result.txId, transaction_type: "OUT", quantity } }, 201);
}

// ---------------------------------------------------------------------------
// Transactions (ledger with running balance)
// ---------------------------------------------------------------------------

async function listTransactions(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "transaction.view");
  const query = new URL(req.url).searchParams;
  const partId = optInt(query.get("part_id"), "Part ID");
  const userId = optInt(query.get("user_id"), "User ID");
  const type = (query.get("type") ?? "").trim();
  const from = (query.get("from") ?? "").trim();
  const to = (query.get("to") ?? "").trim();
  const { page, limit, offset } = paginate(query);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (partId) {
    conditions.push("t.part_id = ?");
    params.push(partId);
  }
  if (userId) {
    conditions.push("t.created_by = ?");
    params.push(userId);
  }
  if (type === "IN" || type === "OUT" || type === "OPENING") {
    conditions.push("t.transaction_type = ?");
    params.push(type);
  }
  if (from) {
    conditions.push("t.transaction_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("t.transaction_date <= ?");
    params.push(to);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await all(
    env.DB,
    `select
       t.id, t.part_id, t.transaction_type, t.quantity, t.transaction_date,
       t.source, t.destination, t.supplier, t.machine_id, t.reference_number,
       t.purpose, t.note, t.created_by, t.created_at,
       p.part_code, p.part_name, p.unit_of_measure,
       u.name as created_by_name,
       m.machine_code,
       (p.opening_stock + sum(
         case
           when t.transaction_type = 'IN' then t.quantity
           when t.transaction_type = 'OUT' then -t.quantity
           else 0
         end
       ) over (
         partition by t.part_id
         order by t.transaction_date asc, t.id asc
         rows between unbounded preceding and current row
       )) as balance_after
     from stock_transactions t
     join parts p on p.id = t.part_id
     join users u on u.id = t.created_by
     left join machines m on m.id = t.machine_id
     ${where}
     order by t.transaction_date desc, t.id desc
     limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from stock_transactions t ${where}`,
    ...params
  );
  return json({ items: rows, total: count?.n ?? 0, page, limit });
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

async function listEmployees(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "employee.view");
  const query = new URL(req.url).searchParams;
  const q = (query.get("q") ?? "").trim();
  const department = (query.get("department") ?? "").trim();
  const status = (query.get("status") ?? "").trim();
  const { page, limit, offset } = paginate(query);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q) {
    conditions.push("(e.name like ? or e.employee_code like ? or coalesce(e.designation,'') like ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (department) {
    conditions.push("e.department = ?");
    params.push(department);
  }
  if (status) {
    conditions.push("e.status = ?");
    params.push(status);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await all(
    env.DB,
    `select * from employees e ${where} order by e.id desc limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from employees e ${where}`,
    ...params
  );
  const departments = await all<{ department: string }>(
    env.DB,
    `select distinct department from employees where department is not null and department != '' order by department`
  );
  return json({
    items: rows,
    total: count?.n ?? 0,
    page,
    limit,
    departments: departments.map((d) => d.department),
  });
}

async function createEmployee(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "employee.create");
  const b = await readBody<Record<string, unknown>>(req);
  const employeeCode = reqString(b.employee_code, "Employee ID", { max: 40 });
  const name = reqString(b.name, "Name", { max: 160 });
  const status = b.status === "inactive" ? "inactive" : "active";

  const dup = await one(env.DB, `select 1 as n from employees where employee_code = ?`, employeeCode);
  if (dup) throw new HttpError(409, "An employee with this Employee ID already exists.");

  const result = (await run(
    env.DB,
    `insert into employees (employee_code, name, phone, city, designation, department, joining_date, offdays_taken, offdays_left, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    employeeCode,
    name,
    optString(b.phone, 40) ?? null,
    optString(b.city, 120) ?? null,
    optString(b.designation, 120) ?? null,
    optString(b.department, 120) ?? null,
    optDate(b.joining_date, "Joining date") ?? null,
    optNonNegInt(b.offdays_taken, "Off days taken", 0),
    optNonNegInt(b.offdays_left, "Off days left", 0),
    status
  )) as { meta?: { last_row_id?: number } };

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Employee",
    recordId: result.meta?.last_row_id,
    description: `Employee "${name}" (${employeeCode}) created.`,
  });
  return json({ item: { id: result.meta?.last_row_id, employee_code: employeeCode, name, status } }, 201);
}

async function updateEmployee(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "employee.edit");
  const id = reqInt(ctx.params.id, "Employee ID");
  if (!(await exists(env, "employees", id))) throw new HttpError(404, "Employee not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const employeeCode = reqString(b.employee_code, "Employee ID", { max: 40 });
  const name = reqString(b.name, "Name", { max: 160 });
  const status = b.status === "inactive" ? "inactive" : "active";

  const dup = await one(env.DB, `select 1 as n from employees where employee_code = ? and id != ?`, employeeCode, id);
  if (dup) throw new HttpError(409, "An employee with this Employee ID already exists.");

  await run(
    env.DB,
    `update employees set employee_code = ?, name = ?, phone = ?, city = ?, designation = ?, department = ?,
       joining_date = ?, offdays_taken = ?, offdays_left = ?, status = ?, updated_at = datetime('now')
     where id = ?`,
    employeeCode,
    name,
    optString(b.phone, 40) ?? null,
    optString(b.city, 120) ?? null,
    optString(b.designation, 120) ?? null,
    optString(b.department, 120) ?? null,
    optDate(b.joining_date, "Joining date") ?? null,
    optNonNegInt(b.offdays_taken, "Off days taken", 0),
    optNonNegInt(b.offdays_left, "Off days left", 0),
    status,
    id
  );
  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Employee",
    recordId: id,
    description: `Employee "${name}" (${employeeCode}) updated.`,
  });
  return json({ item: { id, employee_code: employeeCode, name, status } });
}

async function deleteEmployee(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "employee.delete");
  const id = reqInt(ctx.params.id, "Employee ID");
  const row = await one<{ name: string; employee_code: string }>(
    env.DB,
    `select name, employee_code from employees where id = ?`,
    id
  );
  if (!row) throw new HttpError(404, "Employee not found.");

  await run(env.DB, `delete from employees where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Employee",
    recordId: id,
    description: `Employee "${row.name}" (${row.employee_code}) deleted.`,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Custom workbook menus
// ---------------------------------------------------------------------------

type WorkbookEntity = "employee" | "part";

const DEFAULT_WORKBOOK_COLUMNS: Record<WorkbookEntity, object[]> = {
  employee: [
    { key: "phone", label: "Phone", type: "text" },
    { key: "designation", label: "Designation", type: "text" },
    { key: "department", label: "Department", type: "text" },
    { key: "joining_date", label: "Joining date", type: "date" },
    { key: "city", label: "City", type: "text" },
    { key: "offdays_taken", label: "Off days taken", type: "number" },
    { key: "offdays_left", label: "Off days left", type: "number" },
  ],
  part: [
    { key: "category", label: "Category", type: "text" },
    { key: "supplier", label: "Supplier", type: "text" },
    { key: "minimum_stock", label: "Minimum stock", type: "number" },
  ],
};

function menuColumns(value: unknown, entityType: WorkbookEntity): object[] {
  if (value === undefined || value === null) return DEFAULT_WORKBOOK_COLUMNS[entityType];
  if (!Array.isArray(value) || value.length > 30) throw new HttpError(400, "Columns must be a list of at most 30 items.");
  return value.map((item, i) => {
    if (!item || typeof item !== "object") throw new HttpError(400, `Column ${i + 1} is invalid.`);
    const c = item as Record<string, unknown>;
    const key = reqString(c.key, `Column ${i + 1} key`, { max: 60 }).replace(/[^a-zA-Z0-9_]/g, "_");
    const label = reqString(c.label, `Column ${i + 1} label`, { max: 80 });
    const type = c.type === "number" || c.type === "date" || c.type === "textarea" ? c.type : "text";
    return { key, label, type };
  });
}

function jsonValue(value: string | null | undefined, fallback: unknown): unknown {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function menuPayload<T extends { columns: string }>(row: T): T & { columns: unknown } {
  return { ...row, columns: jsonValue(row.columns, []) };
}

async function listMenus(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  if (!user) throw new HttpError(401, "Authentication required.");
  const canManage = user.permissions.includes("settings.manage");
  const canEmployee = user.permissions.includes("employee.view");
  const canPart = user.permissions.includes("part.view");
  if (!canManage && !canEmployee && !canPart) throw new HttpError(403, "You do not have permission to view workbooks.");
  const rows = await all<{ columns: string; entity_type: WorkbookEntity; is_active: number }>(
    env.DB,
    `select id, name, slug, entity_type, icon, description, columns, sort_order, is_active
     from custom_menus order by sort_order asc, id asc`
  );
  return json({ items: rows.filter((r) => canManage || (r.is_active === 1 && ((r.entity_type === "employee" && canEmployee) || (r.entity_type === "part" && canPart)))).map(menuPayload) });
}

async function createMenu(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Menu name", { max: 80 });
  const entityType = b.entity_type === "employee" || b.entity_type === "part" ? b.entity_type : null;
  if (!entityType) throw new HttpError(400, "Entity type must be employee or part.");
  const columns = menuColumns(b.columns, entityType);
  const sortOrder = b.sort_order === undefined ? 0 : Number(b.sort_order);
  if (!Number.isInteger(sortOrder)) throw new HttpError(400, "Sort order must be a whole number.");
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
  const duplicate = await one(env.DB, `select 1 as n from custom_menus where name = ?`, name);
  if (duplicate) throw new HttpError(409, "A menu with this name already exists.");
  const result = (await run(env.DB, `insert into custom_menus (name, slug, entity_type, icon, description, columns, sort_order, is_active, created_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, slug, entityType, optString(b.icon, 8) ?? "📋", optString(b.description, 500) ?? null, JSON.stringify(columns), sortOrder, b.is_active === false ? 0 : 1, session.id)) as { meta?: { last_row_id?: number } };
  await audit(env, { userId: session.id, action: "Create", module: "Menus", recordId: result.meta?.last_row_id, description: `Workbook menu "${name}" created.` });
  return json({ item: { id: result.meta?.last_row_id, name, slug, entity_type: entityType, columns } }, 201);
}

async function updateMenu(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const id = reqInt(ctx.params.id, "Menu ID");
  const existing = await one<{ name: string }>(env.DB, `select name from custom_menus where id = ?`, id);
  if (!existing) throw new HttpError(404, "Menu not found.");
  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Menu name", { max: 80 });
  const entityType = b.entity_type === "employee" || b.entity_type === "part" ? b.entity_type : null;
  if (!entityType) throw new HttpError(400, "Entity type must be employee or part.");
  const columns = menuColumns(b.columns, entityType);
  const sortOrder = Number(b.sort_order ?? 0);
  if (!Number.isInteger(sortOrder)) throw new HttpError(400, "Sort order must be a whole number.");
  const duplicate = await one(env.DB, `select 1 as n from custom_menus where name = ? and id != ?`, name, id);
  if (duplicate) throw new HttpError(409, "A menu with this name already exists.");
  await run(env.DB, `update custom_menus set name = ?, entity_type = ?, icon = ?, description = ?, columns = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') where id = ?`, name, entityType, optString(b.icon, 8) ?? "📋", optString(b.description, 500) ?? null, JSON.stringify(columns), sortOrder, b.is_active === false ? 0 : 1, id);
  await audit(env, { userId: session.id, action: "Update", module: "Menus", recordId: id, description: `Workbook menu "${name}" updated.` });
  return json({ ok: true });
}

async function deleteMenu(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const id = reqInt(ctx.params.id, "Menu ID");
  const existing = await one<{ name: string }>(env.DB, `select name from custom_menus where id = ?`, id);
  if (!existing) throw new HttpError(404, "Menu not found.");
  await run(env.DB, `delete from custom_menus where id = ?`, id);
  await audit(env, { userId: session.id, action: "Delete", module: "Menus", recordId: id, description: `Workbook menu "${existing.name}" deleted.` });
  return json({ ok: true });
}

async function workbookSheet(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const menuId = reqInt(ctx.params.id, "Menu ID");
  const menu = await one<{ id: number; name: string; entity_type: WorkbookEntity; icon: string; description: string | null; columns: string; is_active: number }>(env.DB, `select id, name, entity_type, icon, description, columns, is_active from custom_menus where id = ?`, menuId);
  if (!menu) throw new HttpError(404, "Menu not found.");
  requirePerm(user, user?.permissions.includes("settings.manage") ? "settings.manage" : menu.entity_type === "employee" ? "employee.view" : "part.view");
  const query = new URL(req.url).searchParams;
  const selectedId = optInt(query.get("entity_id"), "Entity ID");
  const entities = menu.entity_type === "employee"
    ? await all(env.DB, `select id, employee_code as code, name, employee_code || ' — ' || name as label from employees order by name asc`)
    : await all(env.DB, `select id, part_code as code, part_name as name, part_code || ' — ' || part_name as label, current_balance from v_part_balance order by part_name asc`);
  const activeId = selectedId ?? (entities[0] as { id?: number } | undefined)?.id;
  const entity = activeId
    ? menu.entity_type === "employee"
      ? await one<Record<string, unknown>>(env.DB, `select id, employee_code, name, phone, designation, department, joining_date, current_salary, last_increment_date, status from employees where id = ?`, activeId)
      : await one<Record<string, unknown>>(env.DB, `select * from v_part_balance where id = ?`, activeId)
    : null;
  if (selectedId && !entity) throw new HttpError(404, "Record not found.");
  const stored = activeId ? await one<{ data: string }>(env.DB, `select data from menu_sheet_data where menu_id = ? and entity_id = ?`, menuId, activeId) : null;
  const transactions = menu.entity_type === "part" && activeId
    ? await all(env.DB, `select t.id, t.transaction_date, t.transaction_type, t.quantity, t.source, t.destination, t.supplier, t.reference_number, t.purpose, t.note, (p.opening_stock + sum(case when t.transaction_type = 'IN' then t.quantity when t.transaction_type = 'OUT' then -t.quantity else 0 end) over (partition by t.part_id order by t.transaction_date asc, t.id asc rows between unbounded preceding and current row)) as balance_after from stock_transactions t join parts p on p.id = t.part_id where t.part_id = ? order by t.transaction_date asc, t.id asc`, selectedId)
    : [];
  return json({ menu: menuPayload(menu), entities, entity, custom_data: jsonValue(stored?.data, {}), transactions });
}

async function saveWorkbookSheet(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const menuId = reqInt(ctx.params.id, "Menu ID");
  const menu = await one<{ entity_type: WorkbookEntity }>(env.DB, `select entity_type from custom_menus where id = ?`, menuId);
  if (!menu) throw new HttpError(404, "Menu not found.");
  const session = requirePerm(user, menu.entity_type === "employee" ? "employee.edit" : "part.edit");
  const b = await readBody<Record<string, unknown>>(req);
  const entityId = reqInt(b.entity_id, "Entity ID");
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) throw new HttpError(400, "Sheet data must be an object.");
  const table = menu.entity_type === "employee" ? "employees" : "parts";
  if (!(await one(env.DB, `select id from ${table} where id = ?`, entityId))) throw new HttpError(404, "Record not found.");
  await run(env.DB, `insert into menu_sheet_data (menu_id, entity_id, data, updated_by, updated_at) values (?, ?, ?, ?, datetime('now')) on conflict(menu_id, entity_id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, menuId, entityId, JSON.stringify(b.data), session.id);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

function parseRoleIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "At least one role must be assigned.");
  }
  const ids = [...new Set(value.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new HttpError(400, "Invalid role IDs.");
  }
  return ids;
}

async function listUsers(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "user.view");
  const query = new URL(req.url).searchParams;
  const q = (query.get("q") ?? "").trim();
  const { page, limit, offset } = paginate(query);
  const where = q ? `where u.name like ? or u.username like ?` : "";
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const rows = await all(
    env.DB,
    `select u.id, u.name, u.username, u.status, u.last_login_at, u.created_at,
       (select group_concat(r.name, ', ') from roles r
          join users_roles ur on ur.role_id = r.id where ur.user_id = u.id) as roles
     from users u ${where} order by u.id asc limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(env.DB, `select count(*) as n from users u ${where}`, ...params);
  return json({ items: rows, total: count?.n ?? 0, page, limit });
}

async function createUser(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "user.create");
  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Name", { max: 160 });
  const username = reqString(b.username, "Username", { max: 60 }).toLowerCase();
  const password = reqString(b.password, "Password", { min: 6, max: 100 });
  const roleIds = parseRoleIds(b.roleIds);

  const rolesCount = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from roles where id in (${roleIds.map(() => "?").join(",")})`,
    ...roleIds
  );
  if ((rolesCount?.n ?? 0) !== roleIds.length) {
    throw new HttpError(404, "One or more selected roles do not exist.");
  }

  const dup = await one(env.DB, `select 1 as n from users where username = ?`, username);
  if (dup) throw new HttpError(409, "A user with this username already exists.");

  const passwordHash = await hashPassword(password);
  const created = await tx(env.DB, async (exec) => {
    const result = (await run(
      exec,
      `insert into users (name, username, password_hash, status) values (?, ?, ?, 'active')`,
      name,
      username,
      passwordHash
    )) as { meta?: { last_row_id?: number } };
    const userId = result.meta?.last_row_id;
    if (userId) {
      for (const roleId of roleIds) {
        await run(exec, `insert into users_roles (user_id, role_id) values (?, ?)`, userId, roleId);
      }
    }
    return userId;
  });

  await audit(env, {
    userId: session.id,
    action: "User creation",
    module: "Users",
    recordId: created,
    description: `User account "${username}" created.`,
  });
  return json({ item: { id: created, name, username, status: "active" } }, 201);
}

async function updateUser(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "user.edit");
  const id = reqInt(ctx.params.id, "User ID");
  if (!(await exists(env, "users", id))) throw new HttpError(404, "User not found.");

  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Name", { max: 160 });
  const username = reqString(b.username, "Username", { max: 60 }).toLowerCase();
  const password =
    b.password === undefined || b.password === null || b.password === ""
      ? undefined
      : reqString(b.password, "Password", { min: 6, max: 100 });
  const roleIds = parseRoleIds(b.roleIds);

  if (id === session.id) throw new HttpError(400, "You cannot change your own roles.");

  const rolesCount = await one<{ n: number }>(
    env.DB,
    `select count(*) as n from roles where id in (${roleIds.map(() => "?").join(",")})`,
    ...roleIds
  );
  if ((rolesCount?.n ?? 0) !== roleIds.length) {
    throw new HttpError(404, "One or more selected roles do not exist.");
  }

  const dup = await one(env.DB, `select 1 as n from users where username = ? and id != ?`, username, id);
  if (dup) throw new HttpError(409, "A user with this username already exists.");

  const passwordHash = password ? await hashPassword(password) : null;
  await tx(env.DB, async (exec) => {
    if (passwordHash) {
      await run(
        exec,
        `update users set name = ?, username = ?, password_hash = ?, updated_at = datetime('now') where id = ?`,
        name,
        username,
        passwordHash,
        id
      );
    } else {
      await run(
        exec,
        `update users set name = ?, username = ?, updated_at = datetime('now') where id = ?`,
        name,
        username,
        id
      );
    }
    await run(exec, `delete from users_roles where user_id = ?`, id);
    for (const roleId of roleIds) {
      await run(exec, `insert into users_roles (user_id, role_id) values (?, ?)`, id, roleId);
    }
  });

  await audit(env, {
    userId: session.id,
    action: "Update",
    module: "Users",
    recordId: id,
    description: `User account "${username}" updated${password ? " (password changed)" : ""}.`,
  });
  return json({ item: { id, name, username } });
}

async function toggleUserStatus(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "user.disable");
  const id = reqInt(ctx.params.id, "User ID");

  const target = await one<{ name: string; username: string; status: string; is_super: number }>(
    env.DB,
    `select u.name, u.username, u.status,
       (select count(*) from users_roles ur join roles r on r.id = ur.role_id
         where ur.user_id = u.id and r.name = 'Super Admin') as is_super
     from users u where u.id = ?`,
    id
  );
  if (!target) throw new HttpError(404, "User not found.");
  if (id === session.id) throw new HttpError(400, "You cannot disable your own account.");

  if (target.status === "active" && target.is_super > 0) {
    const activeSupers = await one<{ n: number }>(
      env.DB,
      `select count(*) as n from users u
       join users_roles ur on ur.user_id = u.id
       join roles r on r.id = ur.role_id
       where r.name = 'Super Admin' and u.status = 'active'`
    );
    if ((activeSupers?.n ?? 0) <= 1) {
      throw new HttpError(400, "Cannot disable the last active Super Admin account.");
    }
  }

  const newStatus = target.status === "active" ? "disabled" : "active";
  await run(env.DB, `update users set status = ?, updated_at = datetime('now') where id = ?`, newStatus, id);
  await audit(env, {
    userId: session.id,
    action: newStatus === "disabled" ? "User disabled" : "User enabled",
    module: "Users",
    recordId: id,
    description: `User account "${target.username}" ${newStatus}.`,
  });
  return json({ ok: true, status: newStatus });
}

async function listRoles(env: Env, user: SessionUser | null): Promise<Response> {
  if (
    !user ||
    !["user.view", "user.create", "user.edit", "settings.manage"].some((p) =>
      user.permissions.includes(p)
    )
  ) {
    throw new HttpError(403, "You do not have permission to perform this action.");
  }
  const rows = await all<{
    id: number;
    name: string;
    description: string | null;
    is_system: number;
    user_count: number;
    permission_keys: string | null;
  }>(
    env.DB,
    `select r.*,
       (select count(*) from users_roles ur where ur.role_id = r.id) as user_count,
       (select group_concat(p.key, '|') from permissions p
          join role_permissions rp on rp.permission_id = p.id where rp.role_id = r.id) as permission_keys
     from roles r order by r.id asc`
  );
  return json({
    items: rows.map((r) => ({ ...r, permissions: r.permission_keys ? r.permission_keys.split("|") : [] })),
  });
}

function permissionsCatalog(): Response {
  const grouped = PERMISSIONS.reduce<Record<string, typeof PERMISSIONS>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
  return json({ modules: grouped });
}

async function createRole(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Role name", { max: 80 });
  const description = optString(b.description, 500);
  const permissionIds = parseRoleIds(b.permissionIds);

  const dup = await one(env.DB, `select 1 as n from roles where name = ?`, name);
  if (dup) throw new HttpError(409, "A role with this name already exists.");

  const created = await tx(env.DB, async (exec) => {
    const result = (await run(
      exec,
      `insert into roles (name, description, is_system) values (?, ?, 0)`,
      name,
      description ?? null
    )) as { meta?: { last_row_id?: number } };
    const roleId = result.meta?.last_row_id;
    if (roleId) {
      for (const pid of permissionIds) {
        await run(exec, `insert into role_permissions (role_id, permission_id) values (?, ?)`, roleId, pid);
      }
    }
    return roleId;
  });

  await audit(env, {
    userId: session.id,
    action: "Create",
    module: "Roles",
    recordId: created,
    description: `Role "${name}" created with ${permissionIds.length} permissions.`,
  });
  return json({ item: { id: created, name } }, 201);
}

async function updateRole(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const id = reqInt(ctx.params.id, "Role ID");
  const existing = await one<{ name: string }>(env.DB, `select name from roles where id = ?`, id);
  if (!existing) throw new HttpError(404, "Role not found.");
  if (id === SUPER_ADMIN_ROLE_ID) {
    throw new HttpError(403, "The Super Admin role permissions cannot be modified.");
  }

  const b = await readBody<Record<string, unknown>>(req);
  const name = reqString(b.name, "Role name", { max: 80 });
  const description = optString(b.description, 500);
  const permissionIds = parseRoleIds(b.permissionIds);

  const dup = await one(env.DB, `select 1 as n from roles where name = ? and id != ?`, name, id);
  if (dup) throw new HttpError(409, "A role with this name already exists.");

  await tx(env.DB, async (exec) => {
    await run(
      exec,
      `update roles set name = ?, description = ?, updated_at = datetime('now') where id = ?`,
      name,
      description ?? null,
      id
    );
    await run(exec, `delete from role_permissions where role_id = ?`, id);
    for (const pid of permissionIds) {
      await run(exec, `insert into role_permissions (role_id, permission_id) values (?, ?)`, id, pid);
    }
  });

  await audit(env, {
    userId: session.id,
    action: "Permission changes",
    module: "Roles",
    recordId: id,
    description: `Permissions for role "${name}" updated (${permissionIds.length} granted).`,
  });
  return json({ ok: true });
}

async function deleteRole(req: Request, env: Env, user: SessionUser | null, ctx: Ctx): Promise<Response> {
  const session = requirePerm(user, "settings.manage");
  const id = reqInt(ctx.params.id, "Role ID");
  const existing = await one<{ name: string; is_system: number }>(
    env.DB,
    `select name, is_system from roles where id = ?`,
    id
  );
  if (!existing) throw new HttpError(404, "Role not found.");
  if (existing.is_system === 1) throw new HttpError(400, "System roles cannot be deleted.");

  const usage = await one<{ n: number }>(env.DB, `select count(*) as n from users_roles where role_id = ?`, id);
  if ((usage?.n ?? 0) > 0) {
    throw new HttpError(409, "This role is assigned to users and cannot be deleted.");
  }

  await run(env.DB, `delete from roles where id = ?`, id);
  await audit(env, {
    userId: session.id,
    action: "Delete",
    module: "Roles",
    recordId: id,
    description: `Role "${existing.name}" deleted.`,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

async function listAuditLogs(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "audit.view");
  const query = new URL(req.url).searchParams;
  const action = (query.get("action") ?? "").trim();
  const module = (query.get("module") ?? "").trim();
  const userId = optInt(query.get("user_id"), "User ID");
  const { page, limit, offset } = paginate(query);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (action) {
    conditions.push("a.action = ?");
    params.push(action);
  }
  if (module) {
    conditions.push("a.module = ?");
    params.push(module);
  }
  if (userId) {
    conditions.push("a.user_id = ?");
    params.push(userId);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await all(
    env.DB,
    `select a.*, u.name as user_name
     from audit_logs a left join users u on u.id = a.user_id
     ${where} order by a.id desc limit ? offset ?`,
    ...params,
    limit,
    offset
  );
  const count = await one<{ n: number }>(env.DB, `select count(*) as n from audit_logs a ${where}`, ...params);
  const modules = await all<{ module: string }>(env.DB, `select distinct module from audit_logs order by module`);
  return json({
    items: rows,
    total: count?.n ?? 0,
    page,
    limit,
    modules: modules.map((m) => m.module),
  });
}

async function purgeAuditLogs(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  if (!user) throw new HttpError(401, "Authentication required.");
  if (!isSuperAdmin(user)) {
    throw new HttpError(403, "Only the Super Admin can purge audit logs.");
  }
  const days = Math.max(
    1,
    parseInt(new URL(req.url).searchParams.get("older_than_days") ?? "365", 10) || 365
  );
  const result = (await run(
    env.DB,
    `delete from audit_logs where created_at < datetime('now', ?)`,
    `-${days} days`
  )) as { meta?: { changes?: number } };

  await audit(env, {
    userId: user.id,
    action: "Purge",
    module: "Audit",
    description: `Purged ${result.meta?.changes ?? 0} audit log entries older than ${days} days.`,
  });
  return json({ ok: true, purged: result.meta?.changes ?? 0 });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function dashboard(env: Env, user: SessionUser | null): Promise<Response> {
  if (!user) throw new HttpError(401, "Authentication required.");

  const counts = await one<Record<string, number>>(
    env.DB,
    `select
       (select count(*) from units) as units,
       (select count(*) from floors) as floors,
       (select count(*) from machines) as machines,
       (select count(*) from machine_types) as machine_types,
       (select count(*) from parts) as parts,
       (select coalesce(sum(current_balance), 0) from v_part_balance) as stock_items,
       (select count(*) from v_part_balance where current_balance < minimum_stock and current_balance > 0) as low_stock,
       (select count(*) from v_part_balance where current_balance <= 0) as out_of_stock,
       (select count(*) from employees) as employees`
  );
  const unitSummary = await all(
    env.DB,
    `select u.unit_name, u.unit_code, count(m.id) as total
     from units u left join machines m on m.unit_id = u.id
     group by u.id order by u.id asc`
  );
  const statusSummary = await all(
    env.DB,
    `select status, count(*) as total from machines group by status order by total desc`
  );
  const recentTx = await all(
    env.DB,
    `select t.id, t.transaction_type, t.quantity, t.transaction_date,
            p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name
     from stock_transactions t
     join parts p on p.id = t.part_id
     join users u on u.id = t.created_by
     order by t.id desc limit 8`
  );
  const lowStock = await all(
    env.DB,
    `select id, part_code, part_name, unit_of_measure, minimum_stock, current_balance
     from v_part_balance where current_balance < minimum_stock
     order by current_balance asc limit 6`
  );
  const partAvailability = await all(
    env.DB,
    `select id, part_code, part_name, unit_of_measure, current_balance, minimum_stock
     from v_part_balance order by part_name asc limit 100`
  );
  const machineAvailability = await all(
    env.DB,
    `select m.id, m.machine_code, m.machine_name, m.status, m.model,
            coalesce(mt.name, 'Unassigned') as machine_type_name,
            coalesce(u.unit_name, 'Unassigned') as unit_name,
            coalesce(f.floor_name, 'Unassigned') as floor_name
     from machines m
     left join machine_types mt on mt.id = m.machine_type_id
     left join units u on u.id = m.unit_id
     left join floors f on f.id = m.floor_id
     order by m.machine_name asc limit 100`
  );

  return json({
    counts: counts ?? { units: 0, floors: 0, machines: 0, machine_types: 0, parts: 0, stock_items: 0, low_stock: 0, out_of_stock: 0, employees: 0 },
    unit_summary: unitSummary,
    status_summary: statusSummary,
    recent_transactions: recentTx,
    low_stock_parts: lowStock,
    part_availability: partAvailability,
    machine_availability: machineAvailability,
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

async function reports(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  requirePerm(user, "report.view");
  const query = new URL(req.url).searchParams;
  const type = query.get("type") ?? "";
  const from = (query.get("from") ?? "").trim();
  const to = (query.get("to") ?? "").trim();
  const partId = optInt(query.get("part_id"), "Part ID");

  switch (type) {
    case "unit-wise":
      return json({
        rows: await all(
          env.DB,
          `select u.id, u.unit_code, u.unit_name, count(m.id) as total_machines
           from units u left join machines m on m.unit_id = u.id
           group by u.id order by u.id asc`
        ),
      });
    case "floor-wise":
      return json({
        rows: await all(
          env.DB,
          `select f.id, u.unit_code, u.unit_name, f.floor_name, f.floor_number, count(m.id) as total_machines
           from floors f join units u on u.id = f.unit_id
           left join machines m on m.floor_id = f.id
           group by f.id, u.id order by u.id asc, f.floor_number asc`
        ),
      });
    case "type-wise":
      return json({
        rows: await all(
          env.DB,
          `select mt.id, mt.name, mt.code, count(m.id) as total_machines
           from machine_types mt left join machines m on m.machine_type_id = mt.id
           group by mt.id order by total_machines desc, mt.name asc`
        ),
      });
    case "status-wise":
      return json({
        rows: await all(env.DB, `select status, count(*) as total_machines from machines group by status order by total_machines desc`),
      });
    case "current-stock":
      return json({ rows: await all(env.DB, `select * from v_part_balance order by part_name asc`) });
    case "stock-in":
    case "stock-out": {
      const isIn = type === "stock-in";
      const conditions: string[] = [`t.transaction_type = '${isIn ? "IN" : "OUT"}'`];
      const params: unknown[] = [];
      if (from) {
        conditions.push("t.transaction_date >= ?");
        params.push(from);
      }
      if (to) {
        conditions.push("t.transaction_date <= ?");
        params.push(to);
      }
      if (partId) {
        conditions.push("t.part_id = ?");
        params.push(partId);
      }
      return json({
        rows: await all(
          env.DB,
          `select t.id, t.transaction_date, t.quantity,
                  ${isIn ? "t.source, t.supplier, t.received_by, t.storage_location" : "t.destination, t.purpose, t.issued_by, t.work_order"},
                  t.reference_number, t.note, t.created_at,
                  p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name,
                  ${isIn ? "null as machine_code" : "m.machine_code"}
           from stock_transactions t
           join parts p on p.id = t.part_id
           join users u on u.id = t.created_by
           left join machines m on m.id = t.machine_id
           where ${conditions.join(" and ")}
           order by t.transaction_date desc, t.id desc limit 500`,
          ...params
        ),
      });
    }
    case "transactions":
      return json({
        rows: await all(
          env.DB,
          `select
             t.id, t.transaction_date, t.transaction_type, t.quantity,
             t.source, t.destination, t.supplier, t.purpose,
             t.reference_number, t.note, t.created_at,
             p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name,
             (p.opening_stock + sum(
               case
                 when t.transaction_type = 'IN' then t.quantity
                 when t.transaction_type = 'OUT' then -t.quantity
                 else 0
               end
             ) over (
               partition by t.part_id
               order by t.transaction_date asc, t.id asc
               rows between unbounded preceding and current row
             )) as balance_after
           from stock_transactions t
           join parts p on p.id = t.part_id
           join users u on u.id = t.created_by
           where 1=1
             ${from ? "and t.transaction_date >= ?" : ""}
             ${to ? "and t.transaction_date <= ?" : ""}
             ${partId ? "and t.part_id = ?" : ""}
           order by t.transaction_date desc, t.id desc limit 1000`,
          ...(from ? [from] : []),
          ...(to ? [to] : []),
          ...(partId ? [partId] : [])
        ),
      });
    case "low-stock":
      return json({
        rows: await all(
          env.DB,
          `select * from v_part_balance where current_balance < minimum_stock and current_balance > 0 order by current_balance asc`
        ),
      });
    case "out-of-stock":
      return json({
        rows: await all(env.DB, `select * from v_part_balance where current_balance <= 0 order by current_balance asc`),
      });
    case "employees-by-department":
      return json({
        rows: await all(
          env.DB,
          `select coalesce(department, 'Unassigned') as department,
                  count(*) as total_employees,
                  sum(case when status = 'active' then 1 else 0 end) as active_employees
           from employees group by coalesce(department, 'Unassigned')
           order by total_employees desc`
        ),
      });
    default:
      throw new HttpError(400, "Unknown report type.");
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\r\n");
}

function csvResponse(rows: Record<string, unknown>[], filename: string): Response {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function exportCsv(req: Request, env: Env, user: SessionUser | null): Promise<Response> {
  const session = requirePerm(user, "report.export");
  const type = new URL(req.url).searchParams.get("type") ?? "";

  let rows: Record<string, unknown>[] = [];
  let filename = "export.csv";

  switch (type) {
    case "machines":
      rows = await all(
        env.DB,
        `select m.machine_code, m.machine_name, mt.name as machine_type,
                u.unit_code, u.unit_name, f.floor_name, m.model, m.serial_number,
                m.manufacturer, m.installation_date, m.status
         from machines m
         join machine_types mt on mt.id = m.machine_type_id
         join units u on u.id = m.unit_id
         join floors f on f.id = m.floor_id
         order by m.machine_code asc`
      );
      filename = "machine-list.csv";
      break;
    case "parts":
      rows = await all(env.DB, `select * from v_part_balance order by part_name asc`);
      filename = "parts-stock.csv";
      break;
    case "transactions": {
      const query = new URL(req.url).searchParams;
      const from = (query.get("from") ?? "").trim();
      const to = (query.get("to") ?? "").trim();
      rows = await all(
        env.DB,
        `select t.transaction_date, t.transaction_type, t.quantity,
                p.part_code, p.part_name, p.unit_of_measure,
                t.source, t.destination, t.supplier, t.reference_number,
                t.purpose, t.note, u.name as created_by,
                (p.opening_stock + sum(
                  case
                    when t.transaction_type = 'IN' then t.quantity
                    when t.transaction_type = 'OUT' then -t.quantity
                    else 0
                  end
                ) over (
                  partition by t.part_id
                  order by t.transaction_date asc, t.id asc
                  rows between unbounded preceding and current row
                )) as balance_after
         from stock_transactions t
         join parts p on p.id = t.part_id
         join users u on u.id = t.created_by
         where 1=1
           ${from ? "and t.transaction_date >= ?" : ""}
           ${to ? "and t.transaction_date <= ?" : ""}
         order by t.transaction_date desc, t.id desc limit 5000`,
        ...(from ? [from] : []),
        ...(to ? [to] : [])
      );
      filename = "stock-transactions.csv";
      break;
    }
    case "employees":
      rows = await all(
        env.DB,
        `select employee_code, name, phone, designation, department, joining_date,
                current_salary, last_increment_date, status
         from employees order by name asc`
      );
      filename = "employee-list.csv";
      break;
    default:
      throw new HttpError(400, "Unknown export type.");
  }

  await audit(env, {
    userId: session.id,
    action: "Export",
    module: "Reports",
    description: `Exported report "${type}" (${rows.length} rows).`,
  });
  return csvResponse(rows, filename);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerRoutes(router: Router): Router {
  // Auth
  router.add("POST", "/api/auth/login", (req, env) => login(req, env).catch(errorResponse));
  router.add("POST", "/api/auth/logout", (req, env, _c, u) => logout(req, env, u).catch(errorResponse));
  router.add("GET", "/api/auth/me", (_req, _env, _c, u) => Promise.resolve(me(u)));

  // Units
  router.add("GET", "/api/units", (_r, env, _c, u) => listUnits(env, u).catch(errorResponse));
  router.add("POST", "/api/units", (req, env, _c, u) => createUnit(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/units/:id", (req, env, c, u) => updateUnit(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/units/:id", (req, env, c, u) => deleteUnit(req, env, u, c).catch(errorResponse));

  // Floors
  router.add("GET", "/api/floors", (req, env, _c, u) => listFloors(req, env, u).catch(errorResponse));
  router.add("POST", "/api/floors", (req, env, _c, u) => createFloor(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/floors/:id", (req, env, c, u) => updateFloor(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/floors/:id", (req, env, c, u) => deleteFloor(req, env, u, c).catch(errorResponse));

  // Machine types
  router.add("GET", "/api/machine-types", (_r, env, _c, u) => listMachineTypes(env, u).catch(errorResponse));
  router.add("POST", "/api/machine-types", (req, env, _c, u) => createMachineType(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/machine-types/:id", (req, env, c, u) => updateMachineType(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/machine-types/:id", (req, env, c, u) => deleteMachineType(req, env, u, c).catch(errorResponse));

  // Machines
  router.add("GET", "/api/machines", (req, env, _c, u) => listMachines(req, env, u).catch(errorResponse));
  router.add("POST", "/api/machines", (req, env, _c, u) => createMachine(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/machines/:id", (req, env, c, u) => updateMachine(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/machines/:id", (req, env, c, u) => deleteMachine(req, env, u, c).catch(errorResponse));

  // Parts
  router.add("GET", "/api/parts", (req, env, _c, u) => listParts(req, env, u).catch(errorResponse));
  router.add("POST", "/api/parts", (req, env, _c, u) => createPart(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/parts/:id", (req, env, c, u) => updatePart(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/parts/:id", (req, env, c, u) => deletePart(req, env, u, c).catch(errorResponse));

  // Stock
  router.add("POST", "/api/stock/in", (req, env, _c, u) => stockIn(req, env, u).catch(errorResponse));
  router.add("POST", "/api/stock/out", (req, env, _c, u) => stockOut(req, env, u).catch(errorResponse));
  router.add("GET", "/api/transactions", (req, env, _c, u) => listTransactions(req, env, u).catch(errorResponse));

  // Employees
  router.add("GET", "/api/employees", (req, env, _c, u) => listEmployees(req, env, u).catch(errorResponse));
  router.add("POST", "/api/employees", (req, env, _c, u) => createEmployee(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/employees/:id", (req, env, c, u) => updateEmployee(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/employees/:id", (req, env, c, u) => deleteEmployee(req, env, u, c).catch(errorResponse));

  // Custom workbook menus
  router.add("GET", "/api/menus", (req, env, _c, u) => listMenus(req, env, u).catch(errorResponse));
  router.add("POST", "/api/menus", (req, env, _c, u) => createMenu(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/menus/:id", (req, env, c, u) => updateMenu(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/menus/:id", (req, env, c, u) => deleteMenu(req, env, u, c).catch(errorResponse));
  router.add("GET", "/api/menus/:id/sheet", (req, env, c, u) => workbookSheet(req, env, u, c).catch(errorResponse));
  router.add("POST", "/api/menus/:id/sheet", (req, env, c, u) => saveWorkbookSheet(req, env, u, c).catch(errorResponse));

  // Users
  router.add("GET", "/api/users", (req, env, _c, u) => listUsers(req, env, u).catch(errorResponse));
  router.add("POST", "/api/users", (req, env, _c, u) => createUser(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/users/:id", (req, env, c, u) => updateUser(req, env, u, c).catch(errorResponse));
  router.add("POST", "/api/users/:id/status", (req, env, c, u) => toggleUserStatus(req, env, u, c).catch(errorResponse));

  // Roles & permissions
  router.add("GET", "/api/roles", (_r, env, _c, u) => listRoles(env, u).catch(errorResponse));
  router.add("POST", "/api/roles", (req, env, _c, u) => createRole(req, env, u).catch(errorResponse));
  router.add("PUT", "/api/roles/:id", (req, env, c, u) => updateRole(req, env, u, c).catch(errorResponse));
  router.add("DELETE", "/api/roles/:id", (req, env, c, u) => deleteRole(req, env, u, c).catch(errorResponse));
  router.add("GET", "/api/permissions", () => Promise.resolve(permissionsCatalog()));

  // Audit
  router.add("GET", "/api/audit-logs", (req, env, _c, u) => listAuditLogs(req, env, u).catch(errorResponse));
  router.add("DELETE", "/api/audit-logs", (req, env, _c, u) => purgeAuditLogs(req, env, u).catch(errorResponse));

  // Dashboard, reports, exports
  router.add("GET", "/api/dashboard", (_r, env, _c, u) => dashboard(env, u).catch(errorResponse));
  router.add("GET", "/api/reports", (req, env, _c, u) => reports(req, env, u).catch(errorResponse));
  router.add("GET", "/api/export", (req, env, _c, u) => exportCsv(req, env, u).catch(errorResponse));

  return router;
}
