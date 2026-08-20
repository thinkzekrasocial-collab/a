import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalDate,
  optionalString,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { employees } from "@/db/schema";

export const dynamic = "force-dynamic";

interface EmployeeBody {
  employee_code?: unknown;
  name?: unknown;
  phone?: unknown;
  city?: unknown;
  designation?: unknown;
  department?: unknown;
  joining_date?: unknown;
  offdays_taken?: unknown;
  offdays_left?: unknown;
  status?: unknown;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "employee.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid employee ID.");

    const existing = await qOne(sql`select id from employees where id = ${id}`);
    if (!existing) throw new ApiError(404, "Employee not found.");

    const body = await readBody<EmployeeBody>(request);
    const employeeCode = requireString(body.employee_code, "Employee ID", { max: 40 });
    const name = requireString(body.name, "Name", { max: 160 });
    const status = body.status === "inactive" ? "inactive" : "active";

    try {
      const updated = await db
        .update(employees)
        .set({
          employeeCode,
          name,
          phone: optionalString(body.phone, 40),
          city: optionalString(body.city, 120),
          designation: optionalString(body.designation, 120),
          department: optionalString(body.department, 120),
          joiningDate: optionalDate(body.joining_date, "Joining date"),
          offdaysTaken: Math.max(0, Math.trunc(Number(body.offdays_taken ?? 0) || 0)),
          offdaysLeft: Math.max(0, Math.trunc(Number(body.offdays_left ?? 0) || 0)),
          status,
          updatedAt: new Date(),
        })
        .where(sql`${employees.id} = ${id}`)
        .returning();
      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Employee",
        recordId: id,
        description: `Employee "${name}" (${employeeCode}) updated.`,
      });
      return Response.json({ item: updated[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "An employee with this Employee ID already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "employee.delete");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid employee ID.");

    const existing = await qOne<{ id: number; name: string; employee_code: string }>(
      sql`select id, name, employee_code from employees where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Employee not found.");

    await db.delete(employees).where(sql`${employees.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Employee",
      recordId: id,
      description: `Employee "${existing.name}" (${existing.employee_code}) deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
