import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { q, qOne } from "@/lib/db";
import {
  ApiError,
  errResponse,
  optionalNonNegativeNumber,
  optionalString,
  paginateParams,
  readBody,
  requirePerm,
  requireString,
  sessionFromRequest,
} from "@/lib/http";
import { isUom } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { parts, stockTransactions } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PartBody {
  part_code?: unknown;
  part_name?: unknown;
  category?: unknown;
  unit_of_measure?: unknown;
  supplier?: unknown;
  country_of_origin?: unknown;
  minimum_stock?: unknown;
  opening_stock?: unknown;
  description?: unknown;
}

const PART_SELECT = sql`
  select p.*,
    (p.opening_stock
      + coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'IN'), 0)
      - coalesce((select sum(quantity) from stock_transactions t where t.part_id = p.id and t.transaction_type = 'OUT'), 0)
    )::float8 as current_balance
  from parts p
`;

export async function GET(request: NextRequest) {
  try {
    await requirePerm(await sessionFromRequest(request), "part.view");
    const url = new URL(request.url);
    const qParam = url.searchParams.get("q")?.trim() ?? "";
    const category = url.searchParams.get("category")?.trim() ?? "";
    const stock = url.searchParams.get("stock") ?? "";
    const { page, limit } = paginateParams(request);
    const offset = (page - 1) * limit;

    const filters = sql`
      ${qParam ? sql`and (p.part_code ilike ${`%${qParam}%`} or p.part_name ilike ${`%${qParam}%`})` : sql``}
      ${category ? sql`and p.category = ${category}` : sql``}
    `;

    const stockFilter =
      stock === "low"
        ? sql`and pb.current_balance < pb.minimum_stock and pb.current_balance > 0`
        : stock === "out"
          ? sql`and pb.current_balance <= 0`
          : sql``;

    const [rows, count, categories] = await Promise.all([
      q<{
        id: number;
        part_code: string;
        part_name: string;
        category: string | null;
        unit_of_measure: string;
        supplier: string | null;
        country_of_origin: string | null;
        minimum_stock: number;
        opening_stock: number;
        description: string | null;
        current_balance: number;
      }>(sql`
        select pb.* from (${PART_SELECT} where 1=1 ${filters}) pb
        where 1=1 ${stockFilter}
        order by pb.part_name asc
        limit ${limit} offset ${offset}
      `),
      qOne<{ total: number }>(sql`
        select count(*)::int as total from (${PART_SELECT} where 1=1 ${filters}) pb
        where 1=1 ${stockFilter}
      `),
      q<{ category: string }>(sql`
        select distinct category from parts where category is not null and category <> '' order by category
      `),
    ]);

    return Response.json({
      items: rows,
      total: count?.total ?? 0,
      page,
      limit,
      categories: categories.map((c) => c.category),
    });
  } catch (error) {
    return errResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePerm(await sessionFromRequest(request), "part.create");
    const body = await readBody<PartBody>(request);

    const partCode = requireString(body.part_code, "Part code", { max: 40 });
    const partName = requireString(body.part_name, "Part name", { max: 160 });
    const uom = requireString(body.unit_of_measure, "Unit of measure");
    if (!isUom(uom)) throw new ApiError(400, "Invalid unit of measure.");
    const minimumStock = optionalNonNegativeNumber(body.minimum_stock, "Minimum stock", 0);
    const openingStock = optionalNonNegativeNumber(body.opening_stock, "Opening stock", 0);

    try {
      // Insert the part and its OPENING ledger entry atomically.
      const created = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(parts)
          .values({
            partCode,
            partName,
            category: optionalString(body.category, 120),
            unitOfMeasure: uom,
            supplier: optionalString(body.supplier, 160),
            countryOfOrigin: optionalString(body.country_of_origin, 120),
            minimumStock: String(minimumStock),
            openingStock: String(openingStock),
            description: optionalString(body.description, 2000),
          })
          .returning();
        const part = inserted[0];
        if (openingStock > 0) {
          await tx.insert(stockTransactions).values({
            partId: part.id,
            transactionType: "OPENING",
            quantity: String(openingStock),
            transactionDate: new Date().toISOString().slice(0, 10),
            note: "Opening balance",
            createdBy: session.id,
          });
        }
        return part;
      });

      await logAudit({
        userId: session.id,
        action: "Create",
        module: "Part",
        recordId: created.id,
        description: `Part "${partName}" (${partCode}) created with opening stock ${openingStock} ${uom}.`,
      });
      return Response.json({ item: created }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "A part with this code already exists.");
      }
      throw error;
    }
  } catch (error) {
    return errResponse(error);
  }
}

// PUT /api/parts/:id and DELETE /api/parts/:id live in [id]/route.ts.
