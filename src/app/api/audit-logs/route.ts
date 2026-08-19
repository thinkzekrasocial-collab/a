import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalInt,
  paginateParams,
  requirePerm,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { isSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "audit.view");
    const url = new URL(request.url);
    const action = url.searchParams.get("action")?.trim() ?? "";
    const module = url.searchParams.get("module")?.trim() ?? "";
    const userId = optionalInt(url.searchParams.get("user_id"), "User ID");
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${action ? sql`and a.action = ${action}` : sql``}
      ${module ? sql`and a.module = ${module}` : sql``}
      ${userId ? sql`and a.user_id = ${userId}` : sql``}
    `;

    const [rows, count, modules] = await Promise.all([
      q<{
        id: number;
        user_id: number | null;
        action: string;
        module: string;
        record_id: string | null;
        description: string | null;
        metadata: string | null;
        ip: string | null;
        created_at: string | Date;
        user_name: string | null;
      }>(sql`
        select a.*, u.name as user_name
        from audit_logs a
        left join users u on u.id = a.user_id
        where 1=1 ${filters}
        order by a.id desc
        limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(sql`
        select count(*)::int as total from audit_logs a where 1=1 ${filters}
      `),
      q<{ module: string }>(sql`
        select distinct module from audit_logs order by module
      `),
    ]);

    return Response.json({
      items: rows,
      total: count?.total ?? 0,
      page,
      limit,
      modules: modules.map((m) => m.module),
    });
  } catch (error) {
    return errResponse(error);
  }
}

/**
 * Purge audit logs older than N days (default 365).
 * Strictly Super Admin only — normal users can never delete audit logs.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) throw new ApiError(401, "Authentication required.");
    if (!isSuperAdmin(session)) {
      throw new ApiError(403, "Only the Super Admin can purge audit logs.");
    }

    const url = new URL(request.url);
    const days = Math.max(
      1,
      parseInt(url.searchParams.get("older_than_days") ?? "365", 10) || 365
    );

    const result = await db
      .delete(auditLogs)
      .where(sql`${auditLogs.createdAt} < now() - make_interval(days => ${days})`);

    await logAudit({
      userId: session.id,
      action: "Purge",
      module: "Audit",
      description: `Purged ${result.rowCount ?? 0} audit log entries older than ${days} days.`,
    });
    return Response.json({ ok: true, purged: result.rowCount ?? 0 });
  } catch (error) {
    return errResponse(error);
  }
}
