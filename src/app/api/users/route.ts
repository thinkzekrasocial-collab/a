import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  paginateParams,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { db, isUniqueViolation } from "@/lib/db";
import { users, usersRoles } from "@/db/schema";

export const dynamic = "force-dynamic";

interface UserBody {
  name?: unknown;
  username?: unknown;
  password?: unknown;
  roleIds?: unknown;
}

function parseRoleIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "At least one role must be assigned.");
  }
  const ids = value.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new ApiError(400, "Invalid role IDs.");
  }
  return [...new Set(ids)];
}

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "user.view");
    const url = new URL(request.url);
    const qParam = url.searchParams.get("q")?.trim() ?? "";
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${qParam ? sql`and (u.name ilike ${`%${qParam}%`} or u.username ilike ${`%${qParam}%`})` : sql``}
    `;

    const [rows, count] = await Promise.all([
      q<{
        id: number;
        name: string;
        username: string;
        status: string;
        last_login_at: string | Date | null;
        created_at: string | Date;
        roles: string | null;
      }>(sql`
        select u.id, u.name, u.username, u.status, u.last_login_at, u.created_at,
          (select string_agg(r.name, ', ' order by r.name) from roles r
             join users_roles ur on ur.role_id = r.id where ur.user_id = u.id) as roles
        from users u where 1=1 ${filters}
        order by u.id asc limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(sql`
        select count(*)::int as total from users u where 1=1 ${filters}
      `),
    ]);

    return Response.json({ items: rows, total: count?.total ?? 0, page, limit });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "user.create");
    const body = await readBody<UserBody>(request);

    const name = requireString(body.name, "Name", { max: 160 });
    const username = requireString(body.username, "Username", { max: 60 }).toLowerCase();
    const password = requireString(body.password, "Password", { min: 6, max: 100 });
    const roleIds = parseRoleIds(body.roleIds);

    const roleCount = await qOne<{ total: number }>(sql`
      select count(*)::int as total from roles where id = any(${roleIds})
    `);
    if ((roleCount?.total ?? 0) !== roleIds.length) {
      throw new ApiError(404, "One or more selected roles do not exist.");
    }

    try {
      const passwordHash = await hashPassword(password);
      const created = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({ name, username, passwordHash, status: "active" })
          .returning();
        await tx.insert(usersRoles).values(
          roleIds.map((roleId) => ({ userId: inserted[0].id, roleId }))
        );
        return inserted[0];
      });

      await logAudit({
        userId: session.id,
        action: "User creation",
        module: "Users",
        recordId: created.id,
        description: `User account "${username}" created.`,
      });
      return Response.json({ item: created }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A user with this username already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}
