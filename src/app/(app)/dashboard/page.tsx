"use client";

import Link from "next/link";
import { fmtDate, fmtNum, useApi } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorBox, Spinner, StatCard, Table, Td, txTypeTone } from "@/components/ui";

interface DashboardData {
  counts: { machines: number; parts: number; stock_items: number; employees: number };
  recent_transactions: { id: number; transaction_type: string; quantity: number; transaction_date: string; part_code: string; part_name: string; unit_of_measure: string; created_by_name: string }[];
  part_availability: { id: number; part_code: string; part_name: string; unit_of_measure: string; current_balance: number; minimum_stock: number }[];
  machine_availability: { id: number; machine_code: string; machine_name: string; status: string; model: string | null; machine_type_name: string; unit_name: string; floor_name: string }[];
}

export default function DashboardPage() {
  const { data, loading, error } = useApi<DashboardData>("/api/dashboard");
  const { data: session } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error || !data) return <ErrorBox message={error ?? "Failed to load dashboard."} />;
  const perms = session?.user.permissions ?? [];
  return <div>
    <div className="mb-6"><h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Live availability of machines and parts.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Machines" value={data.counts.machines} icon="⚙️" tone="sky" />
      <StatCard label="Parts" value={data.counts.parts} icon="🧩" tone="teal" />
      <StatCard label="Stock Items" value={fmtNum(data.counts.stock_items)} icon="📦" tone="emerald" />
      <StatCard label="Employees" value={data.counts.employees} icon="👷" tone="violet" />
    </div>
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card title="Parts Availability" actions={perms.includes("part.view") ? <Link href="/parts" className="text-xs font-medium text-teal-700 hover:underline">Open parts →</Link> : null}>
        {data.part_availability.length === 0 ? <EmptyState icon="🧩" title="No parts yet" message="Add parts to see live availability." /> : <Table headers={["Part", "Available", "Minimum", "Status"]}>{data.part_availability.map((p) => { const status = p.current_balance <= 0 ? "Out" : p.current_balance < p.minimum_stock ? "Low" : "Available"; return <tr key={p.id}><Td><span className="font-medium text-slate-800">{p.part_name}</span><span className="ml-1.5 text-xs text-slate-400">{p.part_code}</span></Td><Td className="font-semibold">{fmtNum(p.current_balance)} {p.unit_of_measure}</Td><Td>{fmtNum(p.minimum_stock)} {p.unit_of_measure}</Td><Td><Badge tone={status === "Available" ? "green" : status === "Low" ? "amber" : "red"}>{status}</Badge></Td></tr>; })}</Table>}
      </Card>
      <Card title="Machines Availability" actions={perms.includes("machine.view") ? <Link href="/machines" className="text-xs font-medium text-teal-700 hover:underline">Open machines →</Link> : null}>
        {data.machine_availability.length === 0 ? <EmptyState icon="⚙️" title="No machines yet" message="Add machines to see their availability." /> : <Table headers={["Machine", "Location", "Status"]}>{data.machine_availability.map((m) => <tr key={m.id}><Td><span className="font-medium text-slate-800">{m.machine_name}</span><span className="ml-1.5 text-xs text-slate-400">{m.machine_code}</span></Td><Td>{m.unit_name} · {m.floor_name}</Td><Td><Badge tone={m.status === "Running" || m.status === "Idle" ? "green" : "amber"}>{m.status}</Badge></Td></tr>)}</Table>}
      </Card>
    </div>
    <div className="mt-6"><Card title="Recent Stock Transactions" actions={perms.includes("transaction.view") ? <Link href="/parts/transactions" className="text-xs font-medium text-teal-700 hover:underline">View all →</Link> : null}>
      {data.recent_transactions.length === 0 ? <EmptyState icon="📒" title="No transactions yet" message="Stock IN/OUT entries will appear here." /> : <Table headers={["Date", "Part", "Type", "Qty", "By"]}>{data.recent_transactions.map((t) => <tr key={t.id}><Td>{fmtDate(t.transaction_date)}</Td><Td><span className="font-medium text-slate-800">{t.part_name}</span><span className="ml-1.5 text-xs text-slate-400">{t.part_code}</span></Td><Td><Badge tone={txTypeTone(t.transaction_type)}>{t.transaction_type}</Badge></Td><Td className="font-semibold">{t.transaction_type === "OUT" ? "−" : "+"}{fmtNum(t.quantity)} {t.unit_of_measure}</Td><Td className="text-slate-500">{t.created_by_name}</Td></tr>)}</Table>}
    </Card></div>
  </div>;
}
