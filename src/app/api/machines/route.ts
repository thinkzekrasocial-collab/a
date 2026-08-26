import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalDate,
  optionalInt,
  optionalString,
  paginateParams,
  readBody,
  requireInt,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db, isMachineStatus, isUniqueViolation } from "@/lib/db";
import { machines } from "@/db/schema";

export const dynamic = "force-dynamic";

interface MachineBody {
  machine_code?: unknown;
  machine_name?: unknown;
  machine_type_id?: unknown;
  unit_id?: unknown;
  floor_id?: unknown;
  model?: unknown;
  serial_number?: unknown;
  manufacturer?: unknown;
  installation_date?: unknown;
  status?: unknown;
  description?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "machine.view");
    const url = new URL(request.url);
    const qParam = url.searchParams.get("q")?.trim() ?? "";
    const status = url.searchParams.get("status") ?? "";
    const availability = url.searchParams.get("availability") ?? "";
    const unitId = optionalInt(url.searchParams.get("unit_id"), "Unit ID");
    const floorId = optionalInt(url.searchParams.get("floor_id"), "Floor ID");
    const typeId = optionalInt(url.searchParams.get("type_id"), "Machine type ID");
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${qParam ? sql`and (m.machine_code ilike ${`%${qParam}%`} or m.machine_name ilike ${`%${qParam}%`} or coalesce(m.serial_number,'') ilike ${`%${qParam}%`})` : sql``}
      ${status ? sql`and m.status = ${status}` : sql``}
      ${availability === "available" ? sql`and coalesce((select mt2.transaction_type from machine_transactions mt2 where mt2.machine_id = m.id order by mt2.transaction_date desc, mt2.id desc limit 1), 'IN') = 'IN'` : sql``}
      ${availability === "out" ? sql`and coalesce((select mt2.transaction_type from machine_transactions mt2 where mt2.machine_id = m.id order by mt2.transaction_date desc, mt2.id desc limit 1), 'IN') = 'OUT'` : sql``}
      ${unitId ? sql`and m.unit_id = ${unitId}` : sql``}
      ${floorId ? sql`and m.floor_id = ${floorId}` : sql``}
      ${typeId ? sql`and m.machine_type_id = ${typeId}` : sql``}
    `;

    const [rows, count] = await Promise.all([
      q<{
        id: number;
        machine_code: string;
        machine_name: string;
        machine_type_id: number;
        unit_id: number;
        floor_id: number;
        model: string | null;
        serial_number: string | null;
        manufacturer: string | null;
        installation_date: string | null;
        status: string;
        availability_status: "Available" | "Out";
        description: string | null;
        machine_type_name: string;
        unit_name: string;
        floor_name: string;
        floor_number: number;
      }>(sql`
        select m.*, mt.name as machine_type_name, u.unit_name, f.floor_name, f.floor_number,
          case when coalesce((select mt2.transaction_type from machine_transactions mt2 where mt2.machine_id = m.id order by mt2.transaction_date desc, mt2.id desc limit 1), 'IN') = 'OUT' then 'Out' else 'Available' end as availability_status
        from machines m
        left join machine_types mt on mt.id = m.machine_type_id
        left join units u on u.id = m.unit_id
        left join floors f on f.id = m.floor_id
        where 1=1 ${filters}
        order by lower(left(coalesce(nullif(m.serial_number, ''), m.machine_code), 2)) asc,
                 coalesce(nullif(regexp_replace(substring(coalesce(nullif(m.serial_number, ''), m.machine_code) from 3), '[^0-9].*$', ''), ''), '0')::int asc,
                 lower(coalesce(nullif(m.serial_number, ''), m.machine_code)) asc
        limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(
        sql`select count(*)::int as total from machines m where 1=1 ${filters}`
      ),
    ]);

    return Response.json({
      items: rows,
      total: count?.total ?? 0,
      page,
      limit,
    });
  } catch (error) {
    return errResponse(error);
  }
}

async function validateRelations(body: MachineBody) {
  const machineTypeId = body.machine_type_id === undefined || body.machine_type_id === "" ? null : requireInt(body.machine_type_id, "Machine type");
  const unitId = body.unit_id === undefined || body.unit_id === "" ? null : requireInt(body.unit_id, "Unit");
  const floorId = body.floor_id === undefined || body.floor_id === "" ? null : requireInt(body.floor_id, "Floor");

  if (machineTypeId !== null) {
    const machineType = await qOne(sql`select id from machine_types where id = ${machineTypeId}`);
    if (!machineType) throw new ApiError(404, "Machine type not found.");
  }

  if (unitId !== null) {
    const unit = await qOne(sql`select id from units where id = ${unitId}`);
    if (!unit) throw new ApiError(404, "Unit not found.");
  }

  if (floorId !== null) {
    if (unitId === null) throw new ApiError(400, "A unit is required when selecting a floor.");
    const floor = await qOne(sql`select id from floors where id = ${floorId} and unit_id = ${unitId}`);
    if (!floor) throw new ApiError(404, "Floor not found in the selected unit.");
  }

  const status = requireString(body.status, "Status");
  if (!isMachineStatus(status)) throw new ApiError(400, "Invalid machine status.");

  return { machineTypeId, unitId, floorId, status };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.create");
    const body = await readBody<MachineBody>(request);

    const machineCode = requireString(body.machine_code, "Machine code", { max: 40 });
    const machineName = requireString(body.machine_name, "Machine name", { max: 120 });
    const { machineTypeId, unitId, floorId, status } = await validateRelations(body);

    try {
      const inserted = await db
        .insert(machines)
        .values({
          machineCode,
          machineName,
          machineTypeId,
          unitId,
          floorId,
          model: optionalString(body.model),
          serialNumber: optionalString(body.serial_number),
          manufacturer: optionalString(body.manufacturer),
          installationDate: optionalDate(body.installation_date, "Installation date"),
          status,
          description: optionalString(body.description, 2000),
        })
        .returning();
      const created = inserted[0];
      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Machine",
        recordId: created.id,
        description: `Machine "${machineName}" (${machineCode}) created.`,
      });
      return Response.json({ item: created }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A machine with this code already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

// PUT /api/machines/:id and DELETE /api/machines/:id live in [id]/route.ts.
