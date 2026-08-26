import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import { ApiError, errResponse, sessionFromRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Any signed-in user may view the dashboard; sections are permission-gated
    // on the client, and every data endpoint re-checks its own permission.
    const session = await sessionFromRequest(request);
    if (!session) throw new ApiError(401, "Authentication required.");

    const [counts, unitSummary, statusSummary, recentTx, lowStock] = await Promise.all([
      qOne<{
        units: number;
        floors: number;
        machines: number;
        machine_types: number;
        parts: number;
        stock_items: number;
        low_stock: number;
        out_of_stock: number;
        employees: number;
      }>(sql`
        select
          (select count(*)::int from units) as units,
          (select count(*)::int from floors) as floors,
          (select count(*)::int from machines) as machines,
          (select count(*)::int from machine_types) as machine_types,
          (select count(*)::int from parts) as parts,
          (select coalesce(sum(balance),0)::float8 as stock_items from (
            select
              (p.opening_stock
                + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
                - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
              ) as balance
            from parts p
          ) b) as stock_items,
          (select count(*)::int from parts p where
            (p.opening_stock
              + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
              - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
            ) < p.minimum_stock
            and (p.opening_stock
              + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
              - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
            ) > 0
          ) as low_stock,
          (select count(*)::int from parts p where
            (p.opening_stock
              + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
              - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
            ) <= 0
          ) as out_of_stock,
          (select count(*)::int from employees) as employees
      `),
      q<{ unit_name: string; unit_code: string; total: number }>(sql`
        select u.unit_name, u.unit_code, count(m.id)::int as total
        from units u
        left join machines m on m.unit_id = u.id
        group by u.id
        order by u.id asc
      `),
      q<{ status: string; total: number }>(sql`
        select status, count(*)::int as total from machines group by status order by total desc
      `),
      q<{
        id: number;
        transaction_type: string;
        quantity: number;
        transaction_date: string;
        part_code: string;
        part_name: string;
        unit_of_measure: string;
        created_by_name: string;
      }>(sql`
        select t.id, t.transaction_type, t.quantity, t.transaction_date,
               p.part_code, p.part_name, p.unit_of_measure, u.name as created_by_name
        from stock_transactions t
        join parts p on p.id = t.part_id
        join users u on u.id = t.created_by
        order by t.id desc
        limit 8
      `),
      q<{
        id: number;
        part_code: string;
        part_name: string;
        unit_of_measure: string;
        current_balance: number;
        minimum_stock: number;
      }>(sql`
        select * from (
          select p.id, p.part_code, p.part_name, p.unit_of_measure, p.minimum_stock,
            (p.opening_stock
              + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
              - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
            )::float8 as current_balance
          from parts p
        ) pb
        where pb.current_balance < pb.minimum_stock
        order by pb.current_balance asc
        limit 6
      `),
    ]);

    const [partAvailability, machineAvailability] = await Promise.all([
      q<{ id: number; part_code: string; part_name: string; unit_of_measure: string; current_balance: number; minimum_stock: number }>(sql`
        select * from (
          select p.id, p.part_code, p.part_name, p.unit_of_measure, p.minimum_stock,
            (p.opening_stock + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0) - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0))::float8 as current_balance
          from parts p
        ) pb order by lower(left(pb.part_code, 2)) asc,
          coalesce(nullif(regexp_replace(substring(pb.part_code from 3), '[^0-9].*$', ''), ''), '0')::int asc,
          lower(pb.part_code) asc limit 100
      `),
      q<{ id: number; machine_code: string; machine_name: string; status: string; availability_status: string; model: string | null; machine_type_name: string; unit_name: string; floor_name: string }>(sql`
        select m.id, m.machine_code, m.machine_name, m.status, m.model,
          coalesce(mt.name, 'Unassigned') as machine_type_name,
          coalesce(u.unit_name, 'Unassigned') as unit_name,
          coalesce(f.floor_name, 'Unassigned') as floor_name,
          case when coalesce((select mt2.transaction_type from machine_transactions mt2 where mt2.machine_id = m.id order by mt2.transaction_date desc, mt2.id desc limit 1), 'IN') = 'OUT' then 'Out' else 'Available' end as availability_status
        from machines m
        left join machine_types mt on mt.id = m.machine_type_id
        left join units u on u.id = m.unit_id
        left join floors f on f.id = m.floor_id
        order by lower(left(coalesce(nullif(m.serial_number, ''), m.machine_code), 2)) asc,
          coalesce(nullif(regexp_replace(substring(coalesce(nullif(m.serial_number, ''), m.machine_code) from 3), '[^0-9].*$', ''), ''), '0')::int asc,
          lower(coalesce(nullif(m.serial_number, ''), m.machine_code)) asc limit 100
      `),
    ]);

    return Response.json({
      counts: counts ?? {
        units: 0,
        floors: 0,
        machines: 0,
        machine_types: 0,
        parts: 0,
        stock_items: 0,
        low_stock: 0,
        out_of_stock: 0,
        employees: 0,
      },
      unit_summary: unitSummary,
      status_summary: statusSummary,
      recent_transactions: recentTx,
      low_stock_parts: lowStock,
      part_availability: partAvailability,
      machine_availability: machineAvailability,
    });
  } catch (error) {
    return errResponse(error);
  }
}
