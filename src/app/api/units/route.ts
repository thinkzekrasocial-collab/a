import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q } from "@/lib/db";
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

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "machine.view");
    const rows = await q<{
      id: number;
      unit_name: string;
      unit_code: string;
      location: string | null;
      description: string | null;
      status: string;
      created_at: string | Date;
      machine_count: number;
      floor_count: number;
    }>(sql`
      select u.*,
        (select count(*)::int from machines m where m.unit_id = u.id) as machine_count,
        (select count(*)::int from floors f where f.unit_id = u.id) as floor_count
      from units u
      order by u.id asc
    `);
    return Response.json({ items: rows });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.create");
    const body = await readBody<UnitBody>(request);
    const unitName = requireString(body.unit_name, "Unit name", { max: 120 });
    const unitCode = requireString(body.unit_code, "Unit code", { max: 40 });
    const status = body.status === "inactive" ? "inactive" : "active";

    try {
      const inserted = await db
        .insert(units)
        .values({
          unitName,
          unitCode,
          location: optionalString(body.location),
          description: optionalString(body.description),
          status,
        })
        .returning();
      const created = inserted[0];
      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Unit",
        recordId: created.id,
        description: `Unit "${created.unitName}" (${created.unitCode}) created.`,
      });
      return Response.json({ item: created }, { status: 201 });
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

// PUT /api/units/:id and DELETE /api/units/:id live in [id]/route.ts.
