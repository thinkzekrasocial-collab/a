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
import { machineTypes } from "@/db/schema";

export const dynamic = "force-dynamic";

interface MachineTypeBody {
  name?: unknown;
  code?: unknown;
  description?: unknown;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid machine type ID.");

    const existing = await qOne(sql`select id from machine_types where id = ${id}`);
    if (!existing) throw new ApiError(404, "Machine type not found.");

    const body = await readBody<MachineTypeBody>(request);
    const name = requireString(body.name, "Name", { max: 120 });
    const code = requireString(body.code, "Code", { max: 40 });

    try {
      const updated = await db
        .update(machineTypes)
        .set({
          name,
          code,
          description: optionalString(body.description),
          updatedAt: new Date(),
        })
        .where(sql`${machineTypes.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Machine Type",
        recordId: id,
        description: `Machine type "${name}" (${code}) updated.`,
      });
      return Response.json({ item: updated[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A machine type with this name or code already exists.");
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
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid machine type ID.");

    const existing = await qOne<{ id: number; name: string }>(
      sql`select id, name from machine_types where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Machine type not found.");

    const count = await qOne<{ total: number }>(
      sql`select count(*)::int as total from machines where machine_type_id = ${id}`
    );
    if (count && count.total > 0) {
      throw new ApiError(
        409,
        "Machine type cannot be deleted because machines are assigned to it."
      );
    }

    await db.delete(machineTypes).where(sql`${machineTypes.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Machine Type",
      recordId: id,
      description: `Machine type "${existing.name}" deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
