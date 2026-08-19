import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
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

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "user.edit");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid user ID.");

    const existing = await qOne(sql`select id from users where id = ${id}`);
    if (!existing) throw new ApiError(404, "User not found.");

    const body = await readBody<UserBody>(request);
    const name = requireString(body.name, "Name", { max: 160 });
    const username = requireString(body.username, "Username", { max: 60 }).toLowerCase();
    const password =
      body.password === undefined || body.password === null || body.password === ""
        ? undefined
        : requireString(body.password, "Password", { min: 6, max: 100 });
    const roleIds = parseRoleIds(body.roleIds);

    if (id === session.id) {
      throw new ApiError(400, "You cannot change your own roles.");
    }

    const roleCount = await qOne<{ total: number }>(sql`
      select count(*)::int as total from roles where id = any(${roleIds})
    `);
    if ((roleCount?.total ?? 0) !== roleIds.length) {
      throw new ApiError(404, "One or more selected roles do not exist.");
    }

    try {
      const updated = await db.transaction(async (tx) => {
        const updatedRows = await tx
          .update(users)
          .set({
            name,
            username,
            ...(password ? { passwordHash: await hashPassword(password) } : {}),
            updatedAt: new Date(),
          })
          .where(sql`${users.id} = ${id}`)
          .returning();
        await tx.delete(usersRoles).where(sql`${usersRoles.userId} = ${id}`);
        await tx.insert(usersRoles).values(
          roleIds.map((roleId) => ({ userId: id, roleId }))
        );
        return updatedRows[0];
      });

      await logAudit({
        userId: session.id,
        action: "Update",
        module: "Users",
        recordId: id,
        description: `User account "${username}" updated${password ? " (password changed)" : ""}.`,
      });
      return Response.json({ item: updated });
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
