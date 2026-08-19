"use client";

import { useState } from "react";
import { fmtDate, fmtNum, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  machineStatusTone,
  PageHeader,
  Spinner,
  Table,
  Td,
} from "@/components/ui";

type ReportType =
  | "unit-wise"
  | "floor-wise"
  | "type-wise"
  | "status-wise"
  | "current-stock"
  | "stock-in"
  | "stock-out"
  | "transactions"
  | "low-stock"
  | "out-of-stock"
  | "employees-by-department";

const REPORT_GROUPS: { title: string; icon: string; reports: { type: ReportType; label: string }[] }[] = [
  {
    title: "Machine Reports",
    icon: "⚙️",
    reports: [
      { type: "unit-wise", label: "Unit-wise machines" },
      { type: "floor-wise", label: "Floor-wise machines" },
      { type: "type-wise", label: "Machine type report" },
      { type: "status-wise", label: "Machine status report" },
    ],
  },
  {
    title: "Parts Reports",
    icon: "🧩",
    reports: [
      { type: "current-stock", label: "Current stock" },
      { type: "stock-in", label: "Stock IN report" },
      { type: "stock-out", label: "Stock OUT report" },
      { type: "transactions", label: "Part transaction history" },
      { type: "low-stock", label: "Low-stock report" },
      { type: "out-of-stock", label: "Out-of-stock report" },
    ],
  },
  {
    title: "Employee Reports",
    icon: "👷",
    reports: [{ type: "employees-by-department", label: "Department-wise employees" }],
  },
];

const DATE_FILTERED: ReportType[] = ["stock-in", "stock-out", "transactions"];

function fmt(value: unknown): string {
  return fmtNum(value as number | string | null | undefined);
}

export default function ReportsPage() {
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const perms = me?.user.permissions ?? [];
  const canExport = perms.includes("report.export");

  const [type, setType] = useState<ReportType>("unit-wise");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const path = `/api/reports${queryString({ type, from, to })}`;
  const { data, loading, error } = useApi<{ rows: Record<string, unknown>[] }>(path, [type, from, to]);

  const rows = (data?.rows ?? []) as Record<string, unknown>[];
  const needsDates = DATE_FILTERED.includes(type);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Machine, parts and employee reports with CSV export."
        actions={
          canExport ? (
            <>
              <a href="/api/export?type=machines" download>
                <Button variant="secondary" size="sm">
                  ⬇ Machines CSV
                </Button>
              </a>
              <a href={`/api/export?type=parts`} download>
                <Button variant="secondary" size="sm">
                  ⬇ Parts CSV
                </Button>
              </a>
              <a href={`/api/export?type=transactions${queryString({ from, to })}`} download>
                <Button variant="secondary" size="sm">
                  ⬇ Transactions CSV
                </Button>
              </a>
              <a href="/api/export?type=employees" download>
                <Button variant="secondary" size="sm">
                  ⬇ Employees CSV
                </Button>
              </a>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Report selector */}
        <div className="space-y-4">
          {REPORT_GROUPS.map((group) => (
            <Card key={group.title} title={`${group.icon} ${group.title}`} className="p-0">
              <div className="p-2">
                {group.reports.map((r) => (
                  <button
                    key={r.type}
                    onClick={() => setType(r.type)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      type === r.type
                        ? "bg-teal-700 font-medium text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Report body */}
        <Card
          title={REPORT_GROUPS.flatMap((g) => g.reports).find((r) => r.type === type)?.label}
          className="lg:col-span-3"
          actions={
            needsDates ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="From">
                  <Input
                    type="date"
                    className="w-36"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
                <Field label="To">
                  <Input
                    type="date"
                    className="w-36"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              </div>
            ) : undefined
          }
        >
          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorBox message={error} />
          ) : rows.length === 0 ? (
            <EmptyState icon="📊" title="No data for this report" message="Try a different report or date range." />
          ) : (
            <ReportTable type={type} rows={rows} />
          )}
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Raw API: <code className="rounded bg-slate-100 px-1">GET /api/reports?type={type}</code>{" "}
        · CSV export requires the <b>report.export</b> permission.
      </p>
    </div>
  );
}

function ReportTable({ type, rows }: { type: ReportType; rows: Record<string, unknown>[] }) {
  if (type === "unit-wise") {
    return (
      <Table headers={["Unit Code", "Unit", "Total Machines"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>
              <Badge tone="cyan">{fmt(r.unit_code)}</Badge>
            </Td>
            <Td className="font-medium">{fmt(r.unit_name)}</Td>
            <Td className="font-bold">{fmt(r.total_machines)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "floor-wise") {
    return (
      <Table headers={["Unit", "Floor", "No.", "Total Machines"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>{fmt(r.unit_name)}</Td>
            <Td className="font-medium">{fmt(r.floor_name)}</Td>
            <Td>
              <Badge tone="slate">{fmt(r.floor_number)}</Badge>
            </Td>
            <Td className="font-bold">{fmt(r.total_machines)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "type-wise") {
    return (
      <Table headers={["Type", "Code", "Total Machines"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td className="font-medium">{fmt(r.name)}</Td>
            <Td>
              <Badge tone="cyan">{fmt(r.code)}</Badge>
            </Td>
            <Td className="font-bold">{fmt(r.total_machines)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "status-wise") {
    return (
      <Table headers={["Status", "Total Machines"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>
              <Badge tone={machineStatusTone(String(r.status))}>{fmt(r.status)}</Badge>
            </Td>
            <Td className="font-bold">{fmt(r.total_machines)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "current-stock") {
    return (
      <Table headers={["Code", "Part", "Category", "UoM", "Opening", "Current"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>
              <Badge tone="cyan">{fmt(r.part_code)}</Badge>
            </Td>
            <Td className="font-medium">{fmt(r.part_name)}</Td>
            <Td>{r.category ? fmt(r.category) : "—"}</Td>
            <Td>{fmt(r.unit_of_measure)}</Td>
            <Td>{fmt(r.opening_stock)}</Td>
            <Td className="font-bold">{fmt(r.current_balance)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "stock-in" || type === "stock-out") {
    const isIn = type === "stock-in";
    return (
      <Table headers={["Date", "Part", "Qty", isIn ? "Source" : "Destination", "Ref", "By"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>{fmtDate(String(r.transaction_date))}</Td>
            <Td className="font-medium">
              {fmt(r.part_name)} <span className="text-xs text-slate-400">{fmt(r.part_code)}</span>
            </Td>
            <Td className={`font-semibold ${isIn ? "text-emerald-700" : "text-rose-700"}`}>
              {isIn ? "+" : "−"}
              {fmt(r.quantity)} {fmt(r.unit_of_measure)}
            </Td>
            <Td>{isIn ? (r.source ? fmt(r.source) : "—") : r.destination ? fmt(r.destination) : "—"}</Td>
            <Td>{r.reference_number ? <Badge tone="slate">{fmt(r.reference_number)}</Badge> : "—"}</Td>
            <Td className="text-slate-500">{fmt(r.created_by_name)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "transactions") {
    return (
      <Table headers={["Date", "Part", "Type", "Qty", "Balance After", "Ref", "By"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>{fmtDate(String(r.transaction_date))}</Td>
            <Td className="font-medium">{fmt(r.part_name)}</Td>
            <Td>
              <Badge tone={r.transaction_type === "IN" ? "green" : r.transaction_type === "OUT" ? "red" : "blue"}>
                {fmt(r.transaction_type)}
              </Badge>
            </Td>
            <Td className="font-semibold">
              {r.transaction_type === "OUT" ? "−" : "+"}
              {fmt(r.quantity)} {fmt(r.unit_of_measure)}
            </Td>
            <Td className="font-bold">{fmt(r.balance_after)}</Td>
            <Td>{r.reference_number ? <Badge tone="slate">{fmt(r.reference_number)}</Badge> : "—"}</Td>
            <Td className="text-slate-500">{fmt(r.created_by_name)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "low-stock" || type === "out-of-stock") {
    return (
      <Table headers={["Code", "Part", "UoM", "Current", "Minimum", "Status"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>
              <Badge tone="cyan">{fmt(r.part_code)}</Badge>
            </Td>
            <Td className="font-medium">{fmt(r.part_name)}</Td>
            <Td>{fmt(r.unit_of_measure)}</Td>
            <Td className="font-bold">{fmt(r.current_balance)}</Td>
            <Td>{fmt(r.minimum_stock)}</Td>
            <Td>
              <Badge tone={type === "out-of-stock" ? "red" : "amber"}>
                {type === "out-of-stock" ? "OUT OF STOCK" : "LOW STOCK"}
              </Badge>
            </Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (type === "employees-by-department") {
    return (
      <Table headers={["Department", "Total Employees", "Active"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td className="font-medium">{fmt(r.department)}</Td>
            <Td className="font-bold">{fmt(r.total_employees)}</Td>
            <Td>{fmt(r.active_employees)}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  return null;
}
