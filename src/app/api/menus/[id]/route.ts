import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import { ApiError, errResponse, optionalString, readBody, requirePerm, requireString, sessionFromRequest } from "@/lib/http";
import { db, isUniqueViolation } from "@/lib/db";
import { customMenus } from "@/db/schema";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
type MenuColumn = { key: string; label: string; type: "text" | "number" | "date" | "textarea" };
interface MenuBody { name?: unknown; entity_type?: unknown; icon?: unknown; description?: unknown; columns?: unknown; sort_order?: unknown; is_active?: unknown; }

function idFrom(raw: string) { const id = Number(raw); if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid menu ID."); return id; }
function columnsFrom(value: unknown): MenuColumn[] {
  if (!Array.isArray(value) || value.length > 30) throw new ApiError(400, "Columns must be a list of at most 30 items.");
  return value.map((item, i) => {
    if (!item || typeof item !== "object") throw new ApiError(400, `Column ${i + 1} is invalid.`);
    const c = item as Record<string, unknown>;
    if (typeof c.key !== "string" || !/^[a-zA-Z0-9_]{1,60}$/.test(c.key) || typeof c.label !== "string" || !c.label.trim()) throw new ApiError(400, `Column ${i + 1} is invalid.`);
    return { key: c.key, label: c.label.trim().slice(0, 80), type: c.type === "number" || c.type === "date" || c.type === "textarea" ? c.type : "text" };
  });
}

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
    const id = idFrom((await context.params).id);
    const existing = await qOne<{ id: number; name: string }>(sql`select id, name from custom_menus where id = ${id}`);
    if (!existing) throw new ApiError(404, "Menu not found.");
    const body = await readBody<MenuBody>(request);
    const name = requireString(body.name, "Menu name", { max: 80 });
    const entityType = body.entity_type === "employee" || body.entity_type === "part" ? body.entity_type : null;
    if (!entityType) throw new ApiError(400, "Entity type must be employee or part.");
    const columns = columnsFrom(body.columns);
    const sortOrder = Number(body.sort_order ?? 0);
    if (!Number.isInteger(sortOrder)) throw new ApiError(400, "Sort order must be a whole number.");
    try {
      const [updated] = await db.update(customMenus).set({
        name, entityType, icon: optionalString(body.icon, 8) ?? "📋", description: optionalString(body.description, 500) ?? null,
        columns: JSON.stringify(columns), sortOrder, isActive: body.is_active === false ? 0 : 1, updatedAt: new Date(),
      }).where(sql`${customMenus.id} = ${id}`).returning();
      await logAudit({ userId: session.id, action: "Update", module: "Menus", recordId: id, description: `Workbook menu "${name}" updated.` });
      return Response.json({ item: { ...updated, columns } });
    } catch (error) { if (isUniqueViolation(error)) throw new ApiError(409, "A menu with this name already exists."); throw error; }
  } catch (error) { return errResponse(error); }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
    const id = idFrom((await context.params).id);
    const existing = await qOne<{ name: string }>(sql`select name from custom_menus where id = ${id}`);
    if (!existing) throw new ApiError(404, "Menu not found.");
    await db.delete(customMenus).where(sql`${customMenus.id} = ${id}`);
    await logAudit({ userId: session.id, action: "Delete", module: "Menus", recordId: id, description: `Workbook menu "${existing.name}" deleted.` });
    return Response.json({ ok: true });
  } catch (error) { return errResponse(error); }
}
