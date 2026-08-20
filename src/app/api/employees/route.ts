import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalDate,
  optionalString,
  paginateParams,
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

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "employee.view");
    const url = new URL(request.url);
    const qParam = url.searchParams.get("q")?.trim() ?? "";
    const department = url.searchParams.get("department")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${qParam ? sql`and (e.name ilike ${`%${qParam}%`} or e.employee_code ilike ${`%${qParam}%`} or coalesce(e.designation,'') ilike ${`%${qParam}%`})` : sql``}
      ${department ? sql`and e.department = ${department}` : sql``}
      ${status ? sql`and e.status = ${status}` : sql``}
    `;

    const [rows, count, departments] = await Promise.all([
      q<{
        id: number;
        employee_code: string;
        name: string;
        phone: string | null;
        city: string | null;
        designation: string | null;
        department: string | null;
        joining_date: string | null;
        offdays_taken: number;
        offdays_left: number;
        status: string;
      }>(sql`
        select * from employees e where 1=1 ${filters}
        order by e.id desc limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(sql`
        select count(*)::int as total from employees e where 1=1 ${filters}
      `),
      q<{ department: string }>(sql`
        select distinct department from employees
        where department is not null and department <> '' order by department
      `),
    ]);

    return Response.json({
      items: rows,
      total: count?.total ?? 0,
      page,
      limit,
      departments: departments.map((d) => d.department),
    });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "employee.create");
    const body = await readBody<EmployeeBody>(request);

    const employeeCode = requireString(body.employee_code, "Employee ID", { max: 40 });
    const name = requireString(body.name, "Name", { max: 160 });
    const status = body.status === "inactive" ? "inactive" : "active";

    try {
      const inserted = await db
        .insert(employees)
        .values({
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
        })
        .returning();
      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Employee",
        recordId: inserted[0].id,
        description: `Employee "${name}" (${employeeCode}) created.`,
      });
      return Response.json({ item: inserted[0] }, { status: 201 });
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

// PUT /api/employees/:id and DELETE /api/employees/:id live in [id]/route.ts.
