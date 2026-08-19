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
import { machineTypes } from "@/db/schema";

export const dynamic = "force-dynamic";

interface MachineTypeBody {
  name?: unknown;
  code?: unknown;
  description?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "machine.view");
    const rows = await q<{
      id: number;
      name: string;
      code: string;
      description: string | null;
      machine_count: number;
    }>(sql`
      select mt.*,
        (select count(*)::int from machines m where m.machine_type_id = mt.id) as machine_count
      from machine_types mt
      order by mt.name asc
    `);
    return Response.json({ items: rows });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.create");
    const body = await readBody<MachineTypeBody>(request);
    const name = requireString(body.name, "Name", { max: 120 });
    const code = requireString(body.code, "Code", { max: 40 });

    try {
      const inserted = await db
        .insert(machineTypes)
        .values({ name, code, description: optionalString(body.description) })
        .returning();
      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Machine Type",
        recordId: inserted[0].id,
        description: `Machine type "${name}" (${code}) created.`,
      });
      return Response.json({ item: inserted[0] }, { status: 201 });
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

// PUT /api/machine-types/:id and DELETE /api/machine-types/:id live in [id]/route.ts.
