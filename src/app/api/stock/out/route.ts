import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne, toNum } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalInt,
  optionalString,
  readBody,
  requireDate,
  requireInt,
  requirePerm,
  requirePositiveNumber,
  sessionFromRequest,
} from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { stockTransactions } from "@/db/schema";

export const dynamic = "force-dynamic";

interface StockOutBody {
  part_id?: unknown;
  quantity?: unknown;
  transaction_date?: unknown;
  destination?: unknown;
  machine_id?: unknown;
  purpose?: unknown;
  reference_number?: unknown;
  note?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "stock.out");
    const body = await readBody<StockOutBody>(request);

    const partId = requireInt(body.part_id, "Part");
    const quantity = requirePositiveNumber(body.quantity, "Quantity");
    const transactionDate = requireDate(body.transaction_date, "Date");
    const machineId = optionalInt(body.machine_id, "Machine");

    // Lock + validate + insert inside one transaction so concurrent stock OUT
    // requests can never push the ledger below zero.
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${partId})`);

      const partResult = await tx.execute(
        sql`
          select p.id, p.part_code, p.part_name, p.unit_of_measure,
            (p.opening_stock
              + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
              - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
            )::float8 as balance
          from parts p where p.id = ${partId}
        `
      );
      const part = (partResult.rows[0] ?? undefined) as
        | {
            id: number;
            part_code: string;
            part_name: string;
            unit_of_measure: string;
            balance: string | number | null;
          }
        | undefined;
      if (!part) throw new ApiError(404, "Part not found.");

      const balance = toNum(part.balance);
      if (quantity > balance) {
        throw new ApiError(
          400,
          `Insufficient stock. Available balance: ${balance} ${part.unit_of_measure}.`
        );
      }

      if (machineId) {
        const machineResult = await tx.execute(
          sql`select id from machines where id = ${machineId}`
        );
        if (!machineResult.rows[0]) throw new ApiError(404, "Machine not found.");
      }

      const result = await tx
        .insert(stockTransactions)
        .values({
          partId,
          transactionType: "OUT",
          quantity: String(quantity),
          transactionDate,
          destination: optionalString(body.destination),
          machineId: machineId ?? null,
          purpose: optionalString(body.purpose),
          referenceNumber: optionalString(body.reference_number),
          note: optionalString(body.note, 2000),
          createdBy: session.id,
        })
        .returning();
      return { tx: result[0], part, balance };
    });

    await logAudit({
      userId: session.id,
      action: "Stock OUT",
      module: "Inventory",
      recordId: inserted.tx.id,
      description: `Stock OUT: -${quantity} ${inserted.part.unit_of_measure} of "${inserted.part.part_name}" (${inserted.part.part_code}).`,
      metadata: { partId, quantity, machineId: machineId ?? null, reference: body.reference_number ?? null },
    });

    return Response.json({ item: inserted.tx }, { status: 201 });
  } catch (error) {
    return errResponse(error);
  }
}


