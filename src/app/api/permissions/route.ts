import { ALL_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Permission catalog — grouped by module for role editors. */
export async function GET() {
  const grouped = ALL_PERMISSIONS.reduce<Record<string, unknown[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
  return Response.json({ modules: grouped });
}
