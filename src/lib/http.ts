import { getSessionUser, hasPerm, type SessionUser } from "@/lib/auth";
import { isDateStr } from "@/lib/db";

/** Throwing this aborts a route with a friendly JSON error. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[api] unhandled error:", error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

export async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

/**
 * Server-side authorization gate. Every protected route calls this FIRST.
 * The frontend only hides buttons — this is the real security boundary.
 */
export function requirePerm(
  session: SessionUser | null,
  permission: string
): SessionUser {
  if (!session) throw new ApiError(401, "Authentication required.");
  if (!hasPerm(session, permission)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }
  return session;
}

/** Resolve the session from a request cookie. */
export async function sessionFromRequest(request: Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ab_session="))
    ?.slice("ab_session=".length);
  return getSessionUser(token);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function requireString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} is required.`);
  }
  const v = value.trim();
  if (opts.min && v.length < opts.min) {
    throw new ApiError(400, `${field} must be at least ${opts.min} characters.`);
  }
  if (opts.max && v.length > opts.max) {
    throw new ApiError(400, `${field} must be at most ${opts.max} characters.`);
  }
  return v;
}

export function optionalString(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ApiError(400, "Invalid text value.");
  const v = value.trim();
  if (v.length > max) throw new ApiError(400, `Text is too long (max ${max}).`);
  return v === "" ? undefined : v;
}

export function requireInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${field} must be a valid ID.`);
  }
  return n;
}

export function optionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${field} must be a valid ID.`);
  }
  return n;
}

export function requireDate(value: unknown, field: string): string {
  if (!isDateStr(value)) {
    throw new ApiError(400, `${field} must be a valid date (YYYY-MM-DD).`);
  }
  return value as string;
}

export function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireDate(value, field);
}

export function requirePositiveNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ApiError(400, `${field} must be a number greater than zero.`);
  }
  return n;
}

export function optionalNonNegativeNumber(
  value: unknown,
  field: string,
  fallback: number
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, `${field} must be a number greater than or equal to zero.`);
  }
  return n;
}

export function paginateParams(request: Request): { page: number; limit: number } {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10) || 10)
  );
  return { page, limit };
}

export function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  return real ?? null;
}
