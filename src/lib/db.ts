import { db } from "@/db";
import type { SQL } from "drizzle-orm";

export { db };

/** Run a raw parameterised query and return typed rows. */
export async function q<T = Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result.rows ?? []) as unknown as T[];
}

export async function qOne<T = Record<string, unknown>>(
  query: SQL
): Promise<T | undefined> {
  const rows = await q<T>(query);
  return rows[0];
}

export function toNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toStr(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function safeInt(value: unknown, fallback = 0): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface Page {
  page: number;
  limit: number;
  offset: number;
}

/** Parse & clamp pagination params: ?page=1&limit=10 */
export function paginate(pageParam: string | null, limitParam: string | null): Page {
  const page = Math.max(1, safeInt(pageParam, 1));
  const limit = Math.min(100, Math.max(1, safeInt(limitParam, 10)));
  return { page, limit, offset: (page - 1) * limit };
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function listResult<T>(items: T[], total: number, page: Page): ListResult<T> {
  return { items, total, page: page.page, limit: page.limit };
}

// Re-exported for server-side code; client pages should import from
// @/lib/constants directly to avoid pulling the pg driver into the bundle.
export { MACHINE_STATUSES, UOM_OPTIONS, isMachineStatus, isUom, isDateStr } from "@/lib/constants";

/** true when the pg driver raised a unique-violation (error code 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "23505"
  );
}
