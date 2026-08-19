import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
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

interface StockInBody {
  part_id?: unknown;
  quantity?: unknown;
  transaction_date?: unknown;
  source?: unknown;
  supplier?: unknown;
  reference_number?: unknown;
  note?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "stock.in");
    const body = await readBody<StockInBody>(request);

    const partId = requireInt(body.part_id, "Part");
    const quantity = requirePositiveNumber(body.quantity, "Quantity");
    const transactionDate = requireDate(body.transaction_date, "Date");

    const part = await qOne<{ id: number; part_code: string; part_name: string; unit_of_measure: string }>(
      sql`select id, part_code, part_name, unit_of_measure from parts where id = ${partId}`
    );
    if (!part) throw new ApiError(404, "Part not found.");

    const inserted = await db
      .insert(stockTransactions)
      .values({
        partId,
        transactionType: "IN",
        quantity: String(quantity),
        transactionDate,
        source: optionalString(body.source),
        supplier: optionalString(body.supplier),
        referenceNumber: optionalString(body.reference_number),
        note: optionalString(body.note, 2000),
        createdBy: session.id,
      })
      .returning();

    await logAudit({
      userId: session.id,
      action: "Stock IN",
      module: "Inventory",
      recordId: inserted[0].id,
      description: `Stock IN: +${quantity} ${part.unit_of_measure} of "${part.part_name}" (${part.part_code}).`,
      metadata: { partId, quantity, reference: body.reference_number ?? null },
    });

    return Response.json({ item: inserted[0] }, { status: 201 });
  } catch (error) {
    return errResponse(error);
  }
}
