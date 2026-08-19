import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  errResponse,
  optionalInt,
  paginateParams,
  requirePerm,
  sessionFromRequest,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "transaction.view");
    const url = new URL(request.url);
    const partId = optionalInt(url.searchParams.get("part_id"), "Part ID");
    const userId = optionalInt(url.searchParams.get("user_id"), "User ID");
    const type = url.searchParams.get("type")?.trim() ?? "";
    const from = url.searchParams.get("from")?.trim() ?? "";
    const to = url.searchParams.get("to")?.trim() ?? "";
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${partId ? sql`and t.part_id = ${partId}` : sql``}
      ${userId ? sql`and t.created_by = ${userId}` : sql``}
      ${type === "IN" || type === "OUT" || type === "OPENING" ? sql`and t.transaction_type = ${type}` : sql``}
      ${from ? sql`and t.transaction_date >= ${from}` : sql``}
      ${to ? sql`and t.transaction_date <= ${to}` : sql``}
    `;

    const [rows, count] = await Promise.all([
      q<{
        id: number;
        part_id: number;
        transaction_type: string;
        quantity: number;
        transaction_date: string;
        source: string | null;
        destination: string | null;
        supplier: string | null;
        machine_id: number | null;
        reference_number: string | null;
        purpose: string | null;
        note: string | null;
        created_by: number;
        created_at: string | Date;
        part_code: string;
        part_name: string;
        unit_of_measure: string;
        created_by_name: string;
        machine_code: string | null;
        balance_after: number;
      }>(sql`
        select
          t.id, t.part_id, t.transaction_type, t.quantity, t.transaction_date,
          t.source, t.destination, t.supplier, t.machine_id, t.reference_number,
          t.purpose, t.note, t.created_by, t.created_at,
          p.part_code, p.part_name, p.unit_of_measure,
          u.name as created_by_name,
          m.machine_code,
          (p.opening_stock + sum(
            case
              when t.transaction_type = 'IN' then t.quantity
              when t.transaction_type = 'OUT' then -t.quantity
              else 0
            end
          ) over (
            partition by t.part_id
            order by t.transaction_date asc, t.id asc
            rows between unbounded preceding and current row
          ))::float8 as balance_after
        from stock_transactions t
        join parts p on p.id = t.part_id
        join users u on u.id = t.created_by
        left join machines m on m.id = t.machine_id
        where 1=1 ${filters}
        order by t.transaction_date desc, t.id desc
        limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(sql`
        select count(*)::int as total from stock_transactions t where 1=1 ${filters}
      `),
    ]);

    return Response.json({ items: rows, total: count?.total ?? 0, page, limit });
  } catch (error) {
    return errResponse(error);
  }
}
