"use client";

import { useState, type FormEvent } from "react";
import { api, ApiClientError, fmtDate, useApi } from "@/lib/api";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Table, Td, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { MACHINE_STATUSES } from "@/lib/constants";

const today = () => new Date().toISOString().slice(0, 10);

export default function MachineStockInPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data: recent, loading: recentLoading, reload } = useApi<{ items: { id: number; machine_code: string; machine_name: string; transaction_date: string; source: string | null; created_by_name: string }[] }>("/api/machine-stock/transactions?limit=100");
  const canCreate = me?.user.permissions.includes("machine.create") ?? false;
  const [form, setForm] = useState({ machine_code: "", machine_name: "", model: "", serial_number: "", manufacturer: "", installation_date: "", status: "Idle", transaction_date: today(), source: "", reference_number: "", note: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await api("/api/machine-stock/in", { method: "POST", body: JSON.stringify(form) });
      toast("Machine IN recorded.");
      setForm({ machine_code: "", machine_name: "", model: "", serial_number: "", manufacturer: "", installation_date: "", status: "Idle", transaction_date: today(), source: "", reference_number: "", note: "" });
      reload();
    } catch (error) { toast(error instanceof ApiClientError ? error.message : "Failed to record machine IN.", "error"); }
    finally { setSaving(false); }
  };

  if (!canCreate && me) return <EmptyState icon="🔒" title="Permission required" message="Your role cannot receive machines into inventory." />;
  return <div>
    <PageHeader title="Machine IN" subtitle="Receive a new machine into inventory. Machine type, unit and floor are optional." actions={<Button onClick={() => history.back()} variant="secondary">Back to machines</Button>} />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Receive Machine" className="lg:col-span-1"><form onSubmit={submit} className="space-y-4">
        <Field label="Machine code" required><Input value={form.machine_code} onChange={(e) => setForm({ ...form, machine_code: e.target.value })} placeholder="e.g. MC-001" required /></Field>
        <Field label="Machine name" required><Input value={form.machine_name} onChange={(e) => setForm({ ...form, machine_name: e.target.value })} placeholder="e.g. Sewing Machine" required /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Date" required><Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required /></Field><Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{MACHINE_STATUSES.filter((status) => status !== "Inactive").map((status) => <option key={status}>{status}</option>)}</Select></Field></div>
        <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
        <Field label="Serial number"><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
        <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
        <Field label="Source / supplier"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Supplier or source" /></Field>
        <Field label="Reference number"><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Purchase invoice / GRN" /></Field>
        <Field label="Note"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <Button type="submit" disabled={saving} className="w-full">{saving ? "Recording…" : "📥 Record Machine IN"}</Button>
      </form></Card>
      <Card title="Machine Movement History" className="lg:col-span-2">{recentLoading ? <Spinner /> : !recent?.items.length ? <EmptyState icon="⚙️" title="No machine movements yet" message="Received and sold machines will appear here." /> : <Table headers={["Date", "Machine", "Movement", "Source", "By"]}>{recent.items.map((item) => <tr key={item.id}><Td>{fmtDate(item.transaction_date)}</Td><Td><span className="font-medium">{item.machine_name}</span><span className="ml-1 text-xs text-slate-400">{item.machine_code}</span></Td><Td className="font-semibold text-emerald-700">IN</Td><Td>{item.source ?? "—"}</Td><Td>{item.created_by_name}</Td></tr>)}</Table>}</Card>
    </div>
  </div>;
}
