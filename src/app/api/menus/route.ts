import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalString,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { db, isUniqueViolation } from "@/lib/db";
import { customMenus } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type EntityType = "employee" | "part";
interface MenuColumn { key: string; label: string; type: "text" | "number" | "date" | "textarea"; }
interface MenuBody { name?: unknown; entity_type?: unknown; icon?: unknown; description?: unknown; columns?: unknown; sort_order?: unknown; is_active?: unknown; }

const DEFAULT_COLUMNS: Record<EntityType, MenuColumn[]> = {
  employee: [
    { key: "phone", label: "Phone", type: "text" },
    { key: "nid_number", label: "NID number", type: "text" },
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

function parseColumns(value: unknown, entityType: EntityType): MenuColumn[] {
  if (value === undefined || value === null) return DEFAULT_COLUMNS[entityType];
  if (!Array.isArray(value) || value.length > 30) throw new ApiError(400, "Columns must be a list of at most 30 items.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiError(400, `Column ${index + 1} is invalid.`);
    const column = item as Record<string, unknown>;
    const key = requireString(column.key, `Column ${index + 1} key`, { max: 60 }).replace(/[^a-zA-Z0-9_]/g, "_");
    const label = requireString(column.label, `Column ${index + 1} label`, { max: 80 });
    const type = column.type === "number" || column.type === "date" || column.type === "textarea" ? column.type : "text";
    return { key, label, type } as MenuColumn;
  });
}

function parseRow(row: { columns: string } & Record<string, unknown>) {
  let columns: MenuColumn[] = [];
  try { columns = JSON.parse(row.columns) as MenuColumn[]; } catch { /* old/corrupt config falls back in UI */ }
  return { ...row, columns };
}

function slugify(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) throw new ApiError(401, "Authentication required.");
    const canManage = session.permissions.includes("settings.manage");
    const canEmployee = session.permissions.includes("employee.view");
    const canPart = session.permissions.includes("part.view");
    if (!canManage && !canEmployee && !canPart) throw new ApiError(403, "You do not have permission to view workbooks.");
    const rows = await q<Record<string, unknown> & { columns: string }>(sql`
      select id, name, slug, entity_type, icon, description, columns, sort_order, is_active
      from custom_menus
      where ${canManage ? sql`true` : sql`is_active = 1 and entity_type in (${canEmployee ? sql`'employee'` : sql`'__none__'`}, ${canPart ? sql`'part'` : sql`'__none__'`})`}
      order by sort_order asc, id asc
    `);
    return Response.json({ items: rows.map(parseRow) });
  } catch (error) { return errResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
    const body = await readBody<MenuBody>(request);
    const name = requireString(body.name, "Menu name", { max: 80 });
    const entityType = body.entity_type === "employee" || body.entity_type === "part" ? body.entity_type : null;
    if (!entityType) throw new ApiError(400, "Entity type must be employee or part.");
    const columns = parseColumns(body.columns, entityType);
    const sortOrder = body.sort_order === undefined ? 0 : Number(body.sort_order);
    if (!Number.isInteger(sortOrder)) throw new ApiError(400, "Sort order must be a whole number.");
    try {
      const [created] = await db.insert(customMenus).values({
        name, slug: slugify(name), entityType, icon: optionalString(body.icon, 8) ?? "📋",
        description: optionalString(body.description, 500) ?? null, columns: JSON.stringify(columns),
        sortOrder, isActive: body.is_active === false ? 0 : 1, createdBy: session.id,
      }).returning();
      await logAudit({ userId: session.id, action: "Create", module: "Menus", recordId: created.id, description: `Workbook menu "${name}" created.` });
      return Response.json({ item: { ...created, columns } }, { status: 201 });
    } catch (error) { if (isUniqueViolation(error)) throw new ApiError(409, "A menu with this name already exists."); throw error; }
  } catch (error) { return errResponse(error); }
}
