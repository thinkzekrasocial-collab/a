import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalInt,
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

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "machine.view");
    const url = new URL(request.url);
    const unitId = optionalInt(url.searchParams.get("unit_id"), "Unit ID");

    const rows = await q<{
      id: number;
      unit_id: number;
      floor_name: string;
      floor_number: number;
      description: string | null;
      unit_name: string;
      machine_count: number;
    }>(sql`
      select f.*, u.unit_name,
        (select count(*)::int from machines m where m.floor_id = f.id) as machine_count
      from floors f
      join units u on u.id = f.unit_id
      ${unitId ? sql`where f.unit_id = ${unitId}` : sql``}
      order by f.unit_id asc, f.floor_number asc
    `);
    return Response.json({ items: rows });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.create");
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
      const inserted = await db
        .insert(floors)
        .values({
          unitId,
          floorName,
          floorNumber,
          description: optionalString(body.description),
        })
        .returning();
      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Floor",
        recordId: inserted[0].id,
        description: `Floor "${floorName}" created in unit #${unitId}.`,
      });
      return Response.json({ item: inserted[0] }, { status: 201 });
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

// PUT /api/floors/:id and DELETE /api/floors/:id live in [id]/route.ts.
