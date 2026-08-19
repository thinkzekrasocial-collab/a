/**
 * Client-safe constants and validators.
 * IMPORTANT: keep this module free of any server-only imports (db, pg, ...)
 * so pages can import it without pulling Node code into the browser bundle.
 */

export const MACHINE_STATUSES = [
  "Running",
  "Idle",
  "Under Maintenance",
  "Breakdown",
  "Inactive",
] as const;

export const UOM_OPTIONS = [
  "PCS",
  "KG",
  "Meter",
  "Box",
  "Set",
  "Liter",
  "Other",
] as const;

export function isMachineStatus(value: unknown): value is (typeof MACHINE_STATUSES)[number] {
  return MACHINE_STATUSES.includes(value as never);
}

export function isUom(value: unknown): value is (typeof UOM_OPTIONS)[number] {
  return UOM_OPTIONS.includes(value as never);
}

export function isDateStr(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}
