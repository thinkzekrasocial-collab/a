import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  verifyPassword,
  signSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionUser,
} from "@/lib/auth";
import { ApiError, errResponse, readBody } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBody<LoginBody>(request);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      throw new ApiError(400, "Username and password are required.");
    }

    const user = await qOne<{
      id: number;
      name: string;
      username: string;
      password_hash: string;
      status: string;
      roles: string | null;
      permissions: string | null;
    }>(sql`
      select
        u.id, u.name, u.username, u.password_hash, u.status,
        (select string_agg(r.name, '|' order by r.name) from roles r
           join users_roles ur on ur.role_id = r.id where ur.user_id = u.id) as roles,
        (select string_agg(p.key, '|') from permissions p
           join role_permissions rp on rp.permission_id = p.id
           join users_roles ur2 on ur2.role_id = rp.role_id where ur2.user_id = u.id) as permissions
      from users u
      where u.username = ${username}
    `);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await logAudit({
        userId: user?.id ?? null,
        action: "Login failed",
        module: "Auth",
        description: `Failed login attempt for username "${username}".`,
      });
      throw new ApiError(401, "Invalid login credentials.");
    }

    if (user.status !== "active") {
      throw new ApiError(403, "Your account is disabled. Please contact the administrator.");
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(sql`${users.id} = ${user.id}`);

    const session: SessionUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      status: user.status,
      roles: user.roles ? user.roles.split("|") : [],
      permissions: user.permissions ? user.permissions.split("|") : [],
    };

    await logAudit({
      userId: user.id,
      action: "Login",
      module: "Auth",
      description: `User "${user.username}" logged in.`,
    });

    const token = await signSessionToken(user.id);
    const response = Response.json({ user: session });
    response.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax`
    );
    return response;
  } catch (error) {
    return errResponse(error);
  }
}

export async function GET() {
  // Use /api/auth/me for the current session.
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
