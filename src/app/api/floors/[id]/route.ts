import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalString,
  readBody,
  requireInt,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { floors } from "@/db/schema";

export const dynamic = "force-dynamic";

interface FloorBody {
  unit_id?: unknown;
  floor_name?: unknown;
  floor_number?: unknown;
  description?: unknown;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid floor ID.");

    const existing = await qOne(sql`select id from floors where id = ${id}`);
    if (!existing) throw new ApiError(404, "Floor not found.");

    const body = await readBody<FloorBody>(request);
    const unitId = requireInt(body.unit_id, "Unit");
    const floorName = requireString(body.floor_name, "Floor name", { max: 120 });
    const floorNumber = Number(body.floor_number);
    if (!Number.isInteger(floorNumber) || floorNumber < 0) {
      throw new ApiError(400, "Floor number must be a non-negative whole number.");
    }

    const unit = await qOne(sql`select id from units where id = ${unitId}`);
    if (!unit) throw new ApiError(404, "Unit not found.");

    try {
      const updated = await db
        .update(floors)
        .set({
          unitId,
          floorName,
          floorNumber,
          description: optionalString(body.description),
          updatedAt: new Date(),
        })
        .where(sql`${floors.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Floor",
        recordId: id,
        description: `Floor "${floorName}" updated.`,
      });
      return Response.json({ item: updated[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "This floor number already exists in the selected unit.");
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
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid floor ID.");

    const existing = await qOne<{ id: number; floor_name: string }>(
      sql`select id, floor_name from floors where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Floor not found.");

    const count = await qOne<{ total: number }>(
      sql`select count(*)::int as total from machines where floor_id = ${id}`
    );
    if (count && count.total > 0) {
      throw new ApiError(
        409,
        "Floor cannot be deleted because machines are assigned to it."
      );
    }

    await db.delete(floors).where(sql`${floors.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Floor",
      recordId: id,
      description: `Floor "${existing.floor_name}" deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
