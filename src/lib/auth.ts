import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { sql } from "drizzle-orm";

export const SESSION_COOKIE = "ab_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me-before-production";
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub;
    if (!sub) return null;
    const id = parseInt(sub, 10);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export function hasPerm(session: SessionUser, permission: string): boolean {
  return session.permissions.includes(permission);
}

export function isSuperAdmin(session: SessionUser): boolean {
  return session.roles.includes("Super Admin");
}

/**
 * Load the session user from a token value.
 * Returns null when the token is invalid/expired, the user is missing, or the
 * user has been disabled — disabled users are signed out everywhere.
 */
export async function getSessionUser(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const rows = await q<{
    id: number;
    name: string;
    username: string;
    status: string;
    roles: string | null;
    permissions: string | null;
  }>(sql`
    select
      u.id,
      u.name,
      u.username,
      u.status,
      (select string_agg(r.name, '|' order by r.name) from roles r
        join users_roles ur on ur.role_id = r.id
        where ur.user_id = u.id) as roles,
      (select string_agg(p.key, '|') from permissions p
        join role_permissions rp on rp.permission_id = p.id
        join users_roles ur2 on ur2.role_id = rp.role_id
        where ur2.user_id = u.id) as permissions
    from users u
    where u.id = ${userId}
  `);
  const user = rows[0];
  if (!user || user.status !== "active") return null;

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    status: user.status,
    roles: user.roles ? user.roles.split("|") : [],
    permissions: user.permissions ? user.permissions.split("|") : [],
  };
}
