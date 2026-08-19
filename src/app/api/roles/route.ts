import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
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

async function canViewUsers(session: { permissions: string[] } | null): Promise<boolean> {
  if (!session) return false;
  return ["user.view", "user.create", "user.edit", "settings.manage"].some((p) =>
    session.permissions.includes(p)
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await sessionFromRequest(request);
    if (!(await canViewUsers(session))) {
      throw new ApiError(403, "You do not have permission to perform this action.");
    }
    const rows = await q<{
      id: number;
      name: string;
      description: string | null;
      is_system: number;
      user_count: number;
      permission_keys: string | null;
    }>(sql`
      select r.*,
        (select count(*)::int from users_roles ur where ur.role_id = r.id) as user_count,
        (select string_agg(p.key, '|' order by p.id) from permissions p
           join role_permissions rp on rp.permission_id = p.id
           where rp.role_id = r.id) as permission_keys
      from roles r order by r.id asc
    `);
    return Response.json({
      items: rows.map((r) => ({
        ...r,
        permissions: r.permission_keys ? r.permission_keys.split("|") : [],
      })),
    });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "settings.manage");
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
      const created = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(roles)
          .values({ name, description: description ?? null, isSystem: 0 })
          .returning();
        await tx.insert(rolePermissions).values(
          permissionIds.map((permissionId) => ({
            roleId: inserted[0].id,
            permissionId,
          }))
        );
        return inserted[0];
      });

      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Roles",
        recordId: created.id,
        description: `Role "${name}" created with ${permissionIds.length} permissions.`,
      });
      return Response.json({ item: created }, { status: 201 });
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

// PUT /api/roles/:id and DELETE /api/roles/:id live in [id]/route.ts.
