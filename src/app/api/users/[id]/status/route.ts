import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  requirePerm,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Enable / disable a user account. Requires the `user.disable` permission.
 * Guards: you cannot disable yourself, and you cannot disable the last
 * active Super Admin.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "user.disable");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid user ID.");

    const target = await qOne<{
      id: number;
      name: string;
      username: string;
      status: string;
      is_super_admin: boolean;
    }>(sql`
      select u.id, u.name, u.username, u.status,
        exists(
          select 1 from users_roles ur
          join roles r on r.id = ur.role_id
          where ur.user_id = u.id and r.name = 'Super Admin'
        ) as is_super_admin
      from users u where u.id = ${id}
    `);
    if (!target) throw new ApiError(404, "User not found.");

    if (id === session.id) {
      throw new ApiError(400, "You cannot disable your own account.");
    }

    if (target.status === "active" && target.is_super_admin) {
      const activeSupers = await qOne<{ total: number }>(sql`
        select count(*)::int as total
        from users u
        join users_roles ur on ur.user_id = u.id
        join roles r on r.id = ur.role_id
        where r.name = 'Super Admin' and u.status = 'active'
      `);
      if ((activeSupers?.total ?? 0) <= 1) {
        throw new ApiError(400, "Cannot disable the last active Super Admin account.");
      }
    }

    const newStatus = target.status === "active" ? "disabled" : "active";
    await db
      .update(users)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(sql`${users.id} = ${id}`);

    await logAudit({
      userId: session.id,
      action: newStatus === "disabled" ? "User disabled" : "User enabled",
      module: "Users",
      recordId: id,
      description: `User account "${target.username}" ${newStatus}.`,
    });
    return Response.json({ ok: true, status: newStatus });
  } catch (error) {
    return errResponse(error);
  }
}
