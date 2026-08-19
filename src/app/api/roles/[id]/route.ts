import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
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
import { roles, rolePermissions } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Super Admin role id (seeded) — its permissions are locked. */
const SUPER_ADMIN_ROLE_ID = 1;

interface RoleBody {
  name?: unknown;
  description?: unknown;
  permissionIds?: unknown;
}

function parsePermissionIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new ApiError(400, "permissionIds must be a list.");
  const ids = [...new Set(value.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new ApiError(400, "Invalid permission IDs.");
  }
  return ids;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid role ID.");

    const existing = await qOne<{ id: number; is_system: number; name: string }>(
      sql`select id, is_system, name from roles where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Role not found.");
    if (existing.id === SUPER_ADMIN_ROLE_ID) {
      throw new ApiError(403, "The Super Admin role permissions cannot be modified.");
    }

    const body = await readBody<RoleBody>(request);
    const name = requireString(body.name, "Role name", { max: 80 });
    const description = optionalString(body.description, 500);
    const permissionIds = parsePermissionIds(body.permissionIds);

    const valid = await qOne<{ total: number }>(sql`
      select count(*)::int as total from permissions where id = any(${permissionIds})
    `);
    if ((valid?.total ?? 0) !== permissionIds.length) {
      throw new ApiError(404, "One or more selected permissions do not exist.");
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(roles)
          .set({ name, description: description ?? null, updatedAt: new Date() })
          .where(sql`${roles.id} = ${id}`);
        await tx.delete(rolePermissions).where(sql`${rolePermissions.roleId} = ${id}`);
        await tx.insert(rolePermissions).values(
          permissionIds.map((permissionId) => ({ roleId: id, permissionId }))
        );
      });

      await logAudit({
        userId: session.id,
        action: "Permission changes",
        module: "Roles",
        recordId: id,
        description: `Permissions for role "${name}" updated (${permissionIds.length} granted).`,
      });
      return Response.json({ ok: true });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A role with this name already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid role ID.");

    const existing = await qOne<{ id: number; is_system: number; name: string }>(
      sql`select id, is_system, name from roles where id = ${id}`
    );
    if (!existing) throw new ApiError(404, "Role not found.");
    if (existing.is_system === 1) {
      throw new ApiError(400, "System roles cannot be deleted.");
    }

    const usage = await qOne<{ total: number }>(sql`
      select count(*)::int as total from users_roles where role_id = ${id}
    `);
    if (usage && usage.total > 0) {
      throw new ApiError(409, "This role is assigned to users and cannot be deleted.");
    }

    await db.delete(roles).where(sql`${roles.id} = ${id}`);
    await logAudit({
      userId: session.id,
      action: "Delete",
      module: "Roles",
      recordId: id,
      description: `Role "${existing.name}" deleted.`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errResponse(error);
  }
}
