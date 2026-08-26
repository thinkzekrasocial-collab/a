import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import { ApiError, errResponse, readBody, requirePerm, sessionFromRequest } from "@/lib/http";
import { db } from "@/lib/db";
import { customMenus, menuSheetData } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };
function parseId(raw: string, label: string) { const id = Number(raw); if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, `Invalid ${label}.`); return id; }
function parseJson(value: string | null | undefined, fallback: unknown) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

async function loadMenu(id: number) {
  const menu = await qOne<{ id: number; name: string; entity_type: "employee" | "part"; icon: string; description: string | null; columns: string; is_active: number }>(sql`select id, name, entity_type, icon, description, columns, is_active from custom_menus where id = ${id}`);
  if (!menu) throw new ApiError(404, "Menu not found.");
  return { ...menu, columns: parseJson(menu.columns, []) };
}

async function guard(session: Awaited<ReturnType<typeof sessionFromRequest>>, entityType: string) {
  if (!session) throw new ApiError(401, "Authentication required.");
  const permission = entityType === "employee" ? "employee.view" : "part.view";
  requirePerm(session, session.permissions.includes("settings.manage") ? "settings.manage" : permission);
}

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const id = parseId((await context.params).id, "menu ID");
    const menu = await loadMenu(id);
    const session = await sessionFromRequest(request);
    await guard(session, menu.entity_type);
    const entityId = request.nextUrl.searchParams.get("entity_id");
    const selectedId = entityId ? parseId(entityId, "entity ID") : undefined;
    const entities = menu.entity_type === "employee"
      ? await q<{ id: number; code: string; name: string; label: string }>(sql`select id, employee_code as code, name, employee_code || ' — ' || name as label from employees order by name asc`)
      : await q<{ id: number; code: string; name: string; label: string; current_balance: number }>(sql`select p.id, p.part_code as code, p.part_name as name, p.part_code || ' — ' || p.part_name as label, (p.opening_stock + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0) - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0))::float8 as current_balance from parts p order by lower(left(p.part_code, 2)) asc, coalesce(nullif(regexp_replace(substring(p.part_code from 3), '[^0-9].*$', ''), ''), '0')::int asc, lower(p.part_code) asc`);
    const activeId = selectedId ?? entities[0]?.id;
    const entity = activeId
      ? (menu.entity_type === "employee"
        ? await qOne<Record<string, unknown>>(sql`select id, employee_code, name, phone, nid_number, city, designation, department, joining_date, offdays_taken, offdays_left, status from employees where id = ${activeId}`)
        : await qOne<Record<string, unknown>>(sql`select p.id, p.part_code, p.part_name as name, p.unit_of_measure, p.category, p.supplier, p.minimum_stock, (p.opening_stock + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0) - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0))::float8 as current_balance from parts p where p.id = ${activeId}`))
      : null;
    if (selectedId && !entity) throw new ApiError(404, "Record not found.");
    const sheet = activeId ? await qOne<{ data: string }>(sql`select data from menu_sheet_data where menu_id = ${id} and entity_id = ${activeId}`) : null;
    const transactions = menu.entity_type === "part" && activeId
      ? await q<Record<string, unknown>>(sql`select t.id, t.transaction_date, t.transaction_type, t.quantity, t.source, t.destination, t.supplier, t.reference_number, t.purpose, t.note, (p.opening_stock + sum(case when t.transaction_type = 'IN' then t.quantity when t.transaction_type = 'OUT' then -t.quantity else 0 end) over (partition by t.part_id order by t.transaction_date asc, t.id asc rows between unbounded preceding and current row))::float8 as balance_after from stock_transactions t join parts p on p.id = t.part_id where t.part_id = ${activeId} order by t.transaction_date asc, t.id asc`)
      : [];
    return Response.json({ menu, entities, entity, custom_data: parseJson(sheet?.data, {}), transactions });
  } catch (error) { return errResponse(error); }
}

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const id = parseId((await context.params).id, "menu ID");
    const menu = await loadMenu(id);
    const session = await requirePerm(await sessionFromRequest(request), menu.entity_type === "employee" ? "employee.edit" : "part.edit");
    const body = await readBody<{ entity_id?: unknown; data?: unknown }>(request);
    const entityId = parseId(String(body.entity_id ?? ""), "entity ID");
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new ApiError(400, "Sheet data must be an object.");
    const exists = menu.entity_type === "employee"
      ? await qOne<{ id: number }>(sql`select id from employees where id = ${entityId}`)
      : await qOne<{ id: number }>(sql`select id from parts where id = ${entityId}`);
    if (!exists) throw new ApiError(404, "Record not found.");
    await db.insert(menuSheetData).values({ menuId: id, entityId, data: JSON.stringify(body.data), updatedBy: session.id, updatedAt: new Date() }).onConflictDoUpdate({ target: [menuSheetData.menuId, menuSheetData.entityId], set: { data: JSON.stringify(body.data), updatedBy: session.id, updatedAt: new Date() } });
    return Response.json({ ok: true });
  } catch (error) { return errResponse(error); }
}
