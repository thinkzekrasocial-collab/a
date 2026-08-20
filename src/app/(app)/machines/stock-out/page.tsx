"use client";

import { useState, type FormEvent } from "react";
import { api, ApiClientError, fmtDate, fmtNum, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Table, Td, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface MachineOption { id: number; machine_code: string; machine_name: string; availability_status: string; }
interface PartOption { id: number; part_code: string; part_name: string; unit_of_measure: string; current_balance: number; }
interface PartLine { part_id: string; quantity: string; }
const today = () => new Date().toISOString().slice(0, 10);

export default function MachineStockOutPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data: machinesData, loading: machinesLoading } = useApi<{ items: MachineOption[] }>("/api/machines?availability=available&limit=100");
  const { data: partsData } = useApi<{ items: PartOption[] }>("/api/parts?limit=100");
  const { data: recent, loading: recentLoading, reload } = useApi<{ items: { id: number; machine_name: string; machine_code: string; transaction_type: string; transaction_date: string; customer: string | null; destination: string | null; sale_price: number | null; created_by_name: string }[] }>("/api/machine-stock/transactions?limit=100");
  const canOut = me?.user.permissions.includes("stock.out") ?? false;
  const [form, setForm] = useState({ machine_id: "", transaction_date: today(), destination: "", customer: "", reason: "Sold", sale_price: "", reference_number: "", note: "" });
  const [parts, setParts] = useState<PartLine[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await api("/api/machine-stock/out", { method: "POST", body: JSON.stringify({ ...form, parts: parts.filter((part) => part.part_id && part.quantity) }) });
      toast("Machine OUT recorded and included parts deducted from stock.");
      setForm({ machine_id: "", transaction_date: today(), destination: "", customer: "", reason: "Sold", sale_price: "", reference_number: "", note: "" }); setParts([]); reload();
    } catch (error) { toast(error instanceof ApiClientError ? error.message : "Failed to record machine OUT.", "error"); }
    finally { setSaving(false); }
  };

  if (!canOut && me) return <EmptyState icon="🔒" title="Permission required" message="Your role cannot issue or sell machines." />;
  return <div>
    <PageHeader title="Machine OUT / Sale" subtitle="Issue or sell a machine. Any included parts are deducted from parts stock in the same record." actions={<Button onClick={() => history.back()} variant="secondary">Back to machines</Button>} />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Issue / Sell Machine" className="lg:col-span-1"><form onSubmit={submit} className="space-y-4">
        <Field label="Available machine" required><Select value={form.machine_id} onChange={(e) => setForm({ ...form, machine_id: e.target.value })} required disabled={machinesLoading}><option value="">Select machine…</option>{(machinesData?.items ?? []).map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_name} ({machine.machine_code})</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Date" required><Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required /></Field><Field label="Reason"><Select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}><option>Sold</option><option>Transferred</option><option>Disposed</option><option>Issued</option></Select></Field></div>
        <Field label="Customer / receiver"><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Buyer or receiver" /></Field>
        <Field label="Destination"><Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Company, unit or address" /></Field>
        <Field label="Sale price"><Input type="number" min="0" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} placeholder="0" /></Field>
        <Field label="Reference number"><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Sales invoice / delivery note" /></Field>
        <Field label="Parts included with this machine"><div className="space-y-2">{parts.map((line, index) => <div key={index} className="flex gap-2"><Select className="min-w-0 flex-1" value={line.part_id} onChange={(e) => setParts(parts.map((item, i) => i === index ? { ...item, part_id: e.target.value } : item))}><option value="">Select part…</option>{(partsData?.items ?? []).map((part) => <option key={part.id} value={part.id}>{part.part_name} ({part.part_code}) — {fmtNum(part.current_balance)} {part.unit_of_measure}</option>)}</Select><Input className="w-20" type="number" min="0.01" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => setParts(parts.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /><Button type="button" size="sm" variant="danger" onClick={() => setParts(parts.filter((_, i) => i !== index))}>×</Button></div>)}<Button type="button" size="sm" variant="secondary" onClick={() => setParts([...parts, { part_id: "", quantity: "" }])}>+ Add part</Button></div></Field>
        <Field label="Note"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <Button type="submit" disabled={saving || machinesLoading} variant="danger" className="w-full">{saving ? "Recording…" : "📤 Record Machine OUT / Sale"}</Button>
      </form></Card>
      <Card title="Machine Movement History" className="lg:col-span-2">{recentLoading ? <Spinner /> : !recent?.items.length ? <EmptyState icon="⚙️" title="No machine movements yet" message="Machine issues and sales will appear here." /> : <Table headers={["Date", "Machine", "Movement", "Customer", "Destination", "Price", "By"]}>{recent.items.map((item) => <tr key={item.id}><Td>{fmtDate(item.transaction_date)}</Td><Td><span className="font-medium">{item.machine_name}</span><span className="ml-1 text-xs text-slate-400">{item.machine_code}</span></Td><Td><Badge tone={item.transaction_type === "OUT" ? "red" : "green"}>{item.transaction_type}</Badge></Td><Td>{item.customer ?? "—"}</Td><Td>{item.destination ?? "—"}</Td><Td>{item.sale_price == null ? "—" : fmtNum(item.sale_price)}</Td><Td>{item.created_by_name}</Td></tr>)}</Table>}</Card>
    </div>
  </div>;
}
