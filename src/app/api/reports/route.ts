import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalInt,
  requirePerm,
  sessionFromRequest,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Unified reports endpoint: GET /api/reports?type=<report>&from=&to=
 *
 *   type = unit-wise | floor-wise | type-wise | status-wise |
 *          current-stock | stock-in | stock-out | transactions |
 *          low-stock | out-of-stock | employees-by-department
 *
 * Requires the `report.view` permission.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "report.view");
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "";
    const from = url.searchParams.get("from")?.trim() ?? "";
    const to = url.searchParams.get("to")?.trim() ?? "";
    const partId = optionalInt(url.searchParams.get("part_id"), "Part ID");

    switch (type) {
      case "unit-wise":
        return Response.json({
          rows: await q(sql`
            select u.id, u.unit_code, u.unit_name, count(m.id)::int as total_machines
            from units u
            left join machines m on m.unit_id = u.id
            group by u.id
            order by u.id asc
          `),
        });

      case "floor-wise":
        return Response.json({
          rows: await q(sql`
            select f.id, u.unit_code, u.unit_name, f.floor_name, f.floor_number,
                   count(m.id)::int as total_machines
            from floors f
            join units u on u.id = f.unit_id
            left join machines m on m.floor_id = f.id
            group by f.id, u.id
            order by u.id asc, f.floor_number asc
          `),
        });

      case "type-wise":
        return Response.json({
          rows: await q(sql`
            select mt.id, mt.name, mt.code, count(m.id)::int as total_machines
            from machine_types mt
            left join machines m on m.machine_type_id = mt.id
            group by mt.id
            order by total_machines desc, mt.name asc
          `),
        });

      case "status-wise":
        return Response.json({
          rows: await q(sql`
            select m.status, count(*)::int as total_machines
            from machines m group by m.status order by total_machines desc
          `),
        });

      case "current-stock":
        return Response.json({
          rows: await q(sql`
            select p.id, p.part_code, p.part_name, p.category, p.unit_of_measure,
                   p.supplier, p.minimum_stock, p.opening_stock,
                   (p.opening_stock
                     + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
                     - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
                   )::float8 as current_balance
            from parts p
            order by lower(left(p.part_code, 2)) asc,
                     coalesce(nullif(regexp_replace(substring(p.part_code from 3), '[^0-9].*$', ''), ''), '0')::int asc,
                     lower(p.part_code) asc
          `),
        });

      case "stock-in":
        return Response.json({
          rows: await q(sql`
            select t.id, t.transaction_date, t.quantity, t.source, t.supplier,
                   t.received_by, t.storage_location,
                   t.reference_number, t.note, t.created_at,
                   p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name
            from stock_transactions t
            join parts p on p.id = t.part_id
            join users u on u.id = t.created_by
            where t.transaction_type = 'IN'
              ${from ? sql`and t.transaction_date >= ${from}` : sql``}
              ${to ? sql`and t.transaction_date <= ${to}` : sql``}
              ${partId ? sql`and t.part_id = ${partId}` : sql``}
            order by t.transaction_date desc, t.id desc
            limit 500
          `),
        });

      case "stock-out":
        return Response.json({
          rows: await q(sql`
            select t.id, t.transaction_date, t.quantity, t.destination, t.purpose,
                   t.issued_by, t.work_order,
                   t.reference_number, t.note, t.created_at,
                   p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name,
                   m.machine_code, m.machine_name
            from stock_transactions t
            join parts p on p.id = t.part_id
            join users u on u.id = t.created_by
            left join machines m on m.id = t.machine_id
            where t.transaction_type = 'OUT'
              ${from ? sql`and t.transaction_date >= ${from}` : sql``}
              ${to ? sql`and t.transaction_date <= ${to}` : sql``}
              ${partId ? sql`and t.part_id = ${partId}` : sql``}
            order by t.transaction_date desc, t.id desc
            limit 500
          `),
        });

      case "transactions":
        return Response.json({
          rows: await q(sql`
            select t.id, t.transaction_date, t.transaction_type, t.quantity,
                   t.source, t.destination, t.supplier, t.purpose,
                   t.reference_number, t.note, t.created_at,
                   p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name,
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
            where 1=1
              ${from ? sql`and t.transaction_date >= ${from}` : sql``}
              ${to ? sql`and t.transaction_date <= ${to}` : sql``}
              ${partId ? sql`and t.part_id = ${partId}` : sql``}
            order by t.transaction_date desc, t.id desc
            limit 1000
          `),
        });

      case "low-stock":
        return Response.json({
          rows: await q(sql`
            select pb.* from (
              select p.id, p.part_code, p.part_name, p.category, p.unit_of_measure,
                     p.minimum_stock,
                     (p.opening_stock
                       + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
                       - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
                     )::float8 as current_balance
              from parts p
            ) pb
            where pb.current_balance < pb.minimum_stock and pb.current_balance > 0
            order by pb.current_balance asc
          `),
        });

      case "out-of-stock":
        return Response.json({
          rows: await q(sql`
            select pb.* from (
              select p.id, p.part_code, p.part_name, p.category, p.unit_of_measure,
                     p.minimum_stock,
                     (p.opening_stock
                       + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
                       - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
                     )::float8 as current_balance
              from parts p
            ) pb
            where pb.current_balance <= 0
            order by pb.current_balance asc
          `),
        });

      case "employees-by-department":
        return Response.json({
          rows: await q(sql`
            select coalesce(department, 'Unassigned') as department,
                   count(*)::int as total_employees,
                   sum(case when status = 'active' then 1 else 0 end)::int as active_employees
            from employees
            group by coalesce(department, 'Unassigned')
            order by total_employees desc
          `),
        });

      default:
        throw new ApiError(400, "Unknown report type.");
    }
  } catch (error) {
    return errResponse(error);
  }
}
