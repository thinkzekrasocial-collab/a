import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q } from "@/lib/db";
import { csvResponse } from "@/lib/csv";
import {
  ApiError,
  errResponse,
  requirePerm,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * CSV export endpoint: GET /api/export?type=<machines|parts|transactions|employees>
 * Requires the `report.export` permission.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "report.export");
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "";

    let rows: Record<string, unknown>[] = [];
    let filename = "export.csv";

    switch (type) {
      case "machines": {
        rows = await q(sql`
          select m.machine_code, m.machine_name, mt.name as machine_type,
                 u.unit_code, u.unit_name, f.floor_name, m.model, m.serial_number,
                 m.manufacturer, m.installation_date, m.status
          from machines m
          join machine_types mt on mt.id = m.machine_type_id
          join units u on u.id = m.unit_id
          join floors f on f.id = m.floor_id
          order by m.machine_code asc
        `);
        filename = "machine-list.csv";
        break;
      }
      case "parts": {
        rows = await q(sql`
          select p.part_code, p.part_name, p.category, p.unit_of_measure, p.supplier,
                 p.country_of_origin, p.minimum_stock, p.opening_stock,
                 (p.opening_stock
                   + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
                   - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
                 )::float8 as current_balance
          from parts p
          order by p.part_name asc
        `);
        filename = "parts-stock.csv";
        break;
      }
      case "transactions": {
        const from = url.searchParams.get("from")?.trim() ?? "";
        const to = url.searchParams.get("to")?.trim() ?? "";
        rows = await q(sql`
          select t.transaction_date, t.transaction_type, t.quantity,
                 p.part_code, p.part_name, p.unit_of_measure,
                 t.source, t.destination, t.supplier, t.reference_number,
                 t.purpose, t.note, u.name as created_by,
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
          order by t.transaction_date desc, t.id desc
          limit 5000
        `);
        filename = "stock-transactions.csv";
        break;
      }
      case "employees": {
        rows = await q(sql`
          select employee_code, name, phone, nid_number, city, designation, department, joining_date,
                 current_salary, last_increment_date, status
          from employees
          order by name asc
        `);
        filename = "employee-list.csv";
        break;
      }
      default:
        throw new ApiError(400, "Unknown export type.");
    }

    await logAudit({
      userId: session.id,
      action: "Export",
      module: "Reports",
      description: `Exported report "${type}" (${rows.length} rows).`,
    });

    return csvResponse(rows, filename);
  } catch (error) {
    return errResponse(error);
  }
}
