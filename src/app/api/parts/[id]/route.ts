import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalNonNegativeNumber,
  optionalString,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { isUom } from "@/lib/db";
import { parts } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PartBody {
  part_code?: unknown;
  part_name?: unknown;
  category?: unknown;
  unit_of_measure?: unknown;
  supplier?: unknown;
  country_of_origin?: unknown;
  minimum_stock?: unknown;
  opening_stock?: unknown;
  description?: unknown;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "part.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid part ID.");

    const existing = await qOne<{ id: number; opening_stock: number }>(
      sql`select id, opening_stock from parts where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Part not found.");

    const body = await readBody<PartBody>(request);
    if (
      body.opening_stock !== undefined &&
      body.opening_stock !== null &&
      body.opening_stock !== "" &&
      Number(body.opening_stock) !== Number(existing.opening_stock)
    ) {
      throw new ApiError(
        400,
        "Opening stock cannot be changed after creation. Use Stock IN / OUT instead."
      );
    }

    const partCode = requireString(body.part_code, "Part code", { max: 40 });
    const partName = requireString(body.part_name, "Part name", { max: 160 });
    const uom = requireString(body.unit_of_measure, "Unit of measure");
    if (!isUom(uom)) throw new ApiError(400, "Invalid unit of measure.");
    const minimumStock = optionalNonNegativeNumber(body.minimum_stock, "Minimum stock", 0);

    try {
      const updated = await db
        .update(parts)
        .set({
          partCode,
          partName,
          category: optionalString(body.category, 120),
          unitOfMeasure: uom,
          supplier: optionalString(body.supplier, 160),
          countryOfOrigin: optionalString(body.country_of_origin, 120),
          minimumStock: String(minimumStock),
          description: optionalString(body.description, 2000),
          updatedAt: new Date(),
        })
        .where(sql`${parts.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Part",
        recordId: id,
        description: `Part "${partName}" (${partCode}) updated.`,
      });
      return Response.json({ item: updated[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A part with this code already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "part.delete");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid part ID.");

    const existing = await qOne<{ id: number; part_name: string; part_code: string }>(
      sql`select id, part_name, part_code from parts where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Part not found.");

    const count = await qOne<{ total: number }>(
      sql`select count(*)::int as total from stock_transactions where part_id = ${id}`
    );
    if (count && count.total > 0) {
      throw new ApiError(
        409,
        "Part cannot be deleted because stock transactions exist for it."
      );
    }

    await db.delete(parts).where(sql`${parts.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Part",
      recordId: id,
      description: `Part "${existing.part_name}" (${existing.part_code}) deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
