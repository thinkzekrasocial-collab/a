import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalDate,
  optionalString,
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

type Ctx = { params: Promise<{ id: string }> };

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

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid machine ID.");

    const existing = await qOne(sql`select id from machines where id = ${id}`);
    if (!existing) throw new ApiError(404, "Machine not found.");

    const body = await readBody<MachineBody>(request);
    const machineCode = requireString(body.machine_code, "Machine code", { max: 40 });
    const machineName = requireString(body.machine_name, "Machine name", { max: 120 });
    const { machineTypeId, unitId, floorId, status } = await validateRelations(body);

    try {
      const updated = await db
        .update(machines)
        .set({
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
          updatedAt: new Date(),
        })
        .where(sql`${machines.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Machine",
        recordId: id,
        description: `Machine "${machineName}" (${machineCode}) updated.`,
      });
      return Response.json({ item: updated[0] });
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

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "machine.delete");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid machine ID.");

    const existing = await qOne<{ id: number; machine_name: string; machine_code: string }>(
      sql`select id, machine_name, machine_code from machines where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Machine not found.");

    await db.execute(sql`delete from stock_transactions where machine_id = ${id}`);
    await db.execute(sql`delete from machine_transactions where machine_id = ${id}`);
    await db.execute(sql`delete from audit_logs where record_id = ${String(id)} and module in ('Machine', 'Machine Inventory')`);
    await db.delete(machines).where(sql`${machines.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Machine",
      recordId: id,
      description: `Machine "${existing.machine_name}" (${existing.machine_code}) deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
