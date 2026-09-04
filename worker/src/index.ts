/**
 * Globe Safety — Cloudflare Worker entry point.
 *
 * Serves the complete REST API from Cloudflare Workers + D1.
 * See ./handlers.ts for the endpoint implementations.
 */

import { Router, json, type Env } from "./router";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "./auth";
import { registerRoutes } from "./handlers";
import { all } from "./db";

const router = registerRoutes(new Router());

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check (no auth required)
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      try {
        await all(env.DB, "select 1");
        return json({ ok: true, service: "ab-maintenance-bd-api" });
      } catch (e) {
        console.error("[worker] health check failed:", e);
        return json({ ok: false }, 500);
      }
    }

    // Resolve the session once per request (cookie → JWT → DB user+perms).
    const user = await resolveSession(request, env);
    return router.handle(request, env, user);
  },
};

async function resolveSession(
  request: Request,
  env: Env
): Promise<SessionUser | null> {
  const secret = env.AUTH_SECRET || "dev-only-insecure-secret-change-me";
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!token) return null;
  const sub = await verifySessionToken(token, secret);
  if (!sub) return null;

  const userId = parseInt(sub, 10);
  if (!Number.isFinite(userId)) return null;

  const rows = await all<{
    id: number;
    name: string;
    username: string;
    status: string;
    roles: string | null;
    permissions: string | null;
  }>(
    env.DB,
    `select
       u.id, u.name, u.username, u.status,
       (select group_concat(r.name, '|') from roles r
          join users_roles ur on ur.role_id = r.id where ur.user_id = u.id) as roles,
       (select group_concat(p.key, '|') from permissions p
          join role_permissions rp on rp.permission_id = p.id
          join users_roles ur2 on ur2.role_id = rp.role_id where ur2.user_id = u.id) as permissions
     from users u where u.id = ?`,
    userId
  );
  const row = rows[0];
  if (!row || row.status !== "active") return null;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    roles: row.roles ? row.roles.split("|") : [],
    permissions: row.permissions ? row.permissions.split("|") : [],
  };
}
