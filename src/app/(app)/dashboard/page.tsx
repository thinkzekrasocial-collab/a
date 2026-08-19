"use client";

import Link from "next/link";
import { fmtDate, fmtNum, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Spinner,
  StatCard,
  Table,
  Td,
  txTypeTone,
} from "@/components/ui";

interface DashboardData {
  counts: {
    units: number;
    floors: number;
    machines: number;
    machine_types: number;
    parts: number;
    stock_items: number;
    low_stock: number;
    out_of_stock: number;
    employees: number;
  };
  unit_summary: { unit_name: string; unit_code: string; total: number }[];
  status_summary: { status: string; total: number }[];
  recent_transactions: {
    id: number;
    transaction_type: string;
    quantity: number;
    transaction_date: string;
    part_code: string;
    part_name: string;
    unit_of_measure: string;
    created_by_name: string;
  }[];
  low_stock_parts: {
    id: number;
    part_code: string;
    part_name: string;
    unit_of_measure: string;
    current_balance: number;
    minimum_stock: number;
  }[];
}

export default function DashboardPage() {
  const { data, loading, error } = useApi<DashboardData>("/api/dashboard");
  const { data: session } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error || !data) return <ErrorBox message={error ?? "Failed to load dashboard."} />;

  const { counts, unit_summary, status_summary, recent_transactions, low_stock_parts } = data;
  const perms = session?.user.permissions ?? [];
  const maxMachines = Math.max(1, ...unit_summary.map((u) => u.total));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live overview of machines, parts inventory and employees.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Units" value={counts.units} icon="🏭" tone="slate" />
        <StatCard label="Floors" value={counts.floors} icon="🏢" tone="slate" />
        <StatCard label="Machines" value={counts.machines} icon="⚙️" tone="sky" />
        <StatCard label="Machine Types" value={counts.machine_types} icon="🏷️" tone="violet" />
        <StatCard label="Parts" value={counts.parts} icon="🧩" tone="teal" />
        <StatCard
          label="Stock Items"
          value={fmtNum(counts.stock_items)}
          icon="📦"
          tone="emerald"
          sub="Total on-hand quantity"
        />
        <StatCard
          label="Low Stock"
          value={counts.low_stock}
          icon="⚠️"
          tone="amber"
          sub={counts.low_stock > 0 ? "Needs reorder" : "All good"}
        />
        <StatCard
          label="Out of Stock"
          value={counts.out_of_stock}
          icon="🛑"
          tone="rose"
          sub={counts.out_of_stock > 0 ? "Action required" : "None"}
        />
        <StatCard label="Employees" value={counts.employees} icon="👷" tone="sky" />
        <StatCard
          label="Machine Status"
          value={status_summary.length}
          icon="📡"
          tone="slate"
          sub={
            <span className="flex flex-wrap gap-1 pt-1">
              {status_summary.slice(0, 3).map((s) => (
                <Badge key={s.status} tone="slate">
                  {s.status}: {s.total}
                </Badge>
              ))}
            </span>
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Unit machine summary */}
        <Card title="Unit Machine Summary" className="xl:col-span-1">
          {unit_summary.length === 0 ? (
            <EmptyState icon="🏭" title="No units yet" message="Create units under Machines → Units." />
          ) : (
            <div className="space-y-4">
              {unit_summary.map((u) => (
                <div key={u.unit_code}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {u.unit_name}{" "}
                      <span className="text-xs text-slate-400">({u.unit_code})</span>
                    </span>
                    <span className="font-semibold text-slate-900">{u.total} machines</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
                      style={{ width: `${(u.total / maxMachines) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent stock transactions */}
        <Card
          title="Recent Stock Transactions"
          className="xl:col-span-2"
          actions={
            perms.includes("transaction.view") ? (
              <Link href="/parts/transactions" className="text-xs font-medium text-teal-700 hover:underline">
                View all →
              </Link>
            ) : null
          }
        >
          {recent_transactions.length === 0 ? (
            <EmptyState icon="📒" title="No transactions yet" message="Stock IN/OUT entries will appear here." />
          ) : (
            <Table headers={["Date", "Part", "Type", "Qty", "By"]}>
              {recent_transactions.map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.transaction_date)}</Td>
                  <Td>
                    <span className="font-medium text-slate-800">{t.part_name}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{t.part_code}</span>
                  </Td>
                  <Td>
                    <Badge tone={txTypeTone(t.transaction_type)}>{t.transaction_type}</Badge>
                  </Td>
                  <Td className="font-semibold">
                    {t.transaction_type === "OUT" ? "−" : "+"}
                    {fmtNum(t.quantity)} {t.unit_of_measure}
                  </Td>
                  <Td className="text-slate-500">{t.created_by_name}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {/* Low stock */}
      <div className="mt-6">
        <Card
          title="Low Stock Alerts"
          actions={
            perms.includes("part.view") ? (
              <Link
                href={`/parts${queryString({ stock: "low" })}`}
                className="text-xs font-medium text-teal-700 hover:underline"
              >
                Open parts list →
              </Link>
            ) : null
          }
        >
          {low_stock_parts.length === 0 ? (
            <EmptyState icon="✅" title="No low-stock parts" message="Every part is above its minimum stock level." />
          ) : (
            <Table headers={["Part", "Current", "Minimum", "Status"]}>
              {low_stock_parts.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{p.part_name}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{p.part_code}</span>
                  </Td>
                  <Td>
                    {fmtNum(p.current_balance)} {p.unit_of_measure}
                  </Td>
                  <Td>
                    {fmtNum(p.minimum_stock)} {p.unit_of_measure}
                  </Td>
                  <Td>
                    <Badge tone={p.current_balance <= 0 ? "red" : "amber"}>
                      {p.current_balance <= 0 ? "OUT OF STOCK" : "LOW STOCK"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
