import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalString,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { units } from "@/db/schema";

export const dynamic = "force-dynamic";

interface UnitBody {
  unit_name?: unknown;
  unit_code?: unknown;
  location?: unknown;
  description?: unknown;
  status?: unknown;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid unit ID.");

    const body = await readBody<UnitBody>(request);
    const existing = await qOne(sql`select id from units where id = ${id}`);
    if (!existing) throw new ApiError(404, "Unit not found.");

    const unitName = requireString(body.unit_name, "Unit name", { max: 120 });
    const unitCode = requireString(body.unit_code, "Unit code", { max: 40 });
    const status = body.status === "inactive" ? "inactive" : "active";

    try {
      const updated = await db
        .update(units)
        .set({
          unitName,
          unitCode,
          location: optionalString(body.location),
          description: optionalString(body.description),
          status,
          updatedAt: new Date(),
        })
        .where(sql`${units.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Unit",
        recordId: id,
        description: `Unit "${unitName}" (${unitCode}) updated.`,
      });
      return Response.json({ item: updated[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A unit with this code already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.delete");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid unit ID.");

    const existing = await qOne<{ id: number; unit_name: string }>(
      sql`select id, unit_name from units where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Unit not found.");

    const count = await qOne<{ total: number }>(
      sql`select count(*)::int as total from machines where unit_id = ${id}`
    );
    if (count && count.total > 0) {
      throw new ApiError(
        409,
        "Unit cannot be deleted because machines are assigned to it."
      );
    }

    await db.delete(units).where(sql`${units.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Unit",
      recordId: id,
      description: `Unit "${existing.unit_name}" deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
