/**
 * Tiny dependency-free router for the Worker.
 * Supports static segments and `:param` segments, e.g.
 *   router.add("PUT", "/api/units/:id", handler)
 */

export interface Env {
  DB: D1Database;
  AUTH_SECRET?: string;
}

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
}

export type Handler = (
  req: Request,
  env: Env,
  ctx: Ctx,
  user: import("./auth").SessionUser | null
) => Promise<Response>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({
      method,
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
  }

  match(pathname: string, method?: string): { route: Route; params: Record<string, string> } | null {
    const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    for (const route of this.routes) {
      if (method && route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const pattern = route.segments[i];
        if (pattern.startsWith(":")) {
          params[pattern.slice(1)] = segments[i];
        } else if (pattern !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  async handle(req: Request, env: Env, user: import("./auth").SessionUser | null): Promise<Response> {
    const url = new URL(req.url);
    const found = this.match(url.pathname, req.method);
    if (!found) {
      return json({ error: "Not found." }, 404);
    }
    return found.route.handler(req, env, { params: found.params, query: url.searchParams }, user);
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[worker] unhandled error:", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
