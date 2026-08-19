"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiClientError, fmtDate, fmtNum, queryString, useApi } from "@/lib/api";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Column = { key: string; label: string; type: "text" | "number" | "date" | "textarea" };
interface Menu { id: number; name: string; entity_type: "employee" | "part"; icon: string; description: string | null; columns: Column[]; }
interface Entity { id: number; code: string; name: string; label: string; current_balance?: number; }
interface SheetResponse { menu: Menu; entities: Entity[]; entity: Record<string, unknown> | null; custom_data: Record<string, string | number>; transactions: Record<string, unknown>[]; }

export default function WorkbookPage() {
  const params = useParams<{ menuId: string }>();
  const { toast } = useToast();
  const [entityId, setEntityId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string | number>>>({});
  const path = useMemo(() => `/api/menus/${params.menuId}/sheet${queryString({ entity_id: entityId || undefined })}`, [params.menuId, entityId]);
  const { data, loading, error, reload } = useApi<SheetResponse>(path, [path]);
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const [saving, setSaving] = useState(false);
  const canEdit = data?.menu.entity_type === "employee" ? me?.user.permissions.includes("employee.edit") : me?.user.permissions.includes("part.edit");
  const selectedEntityId = entityId || (data?.entities[0] ? String(data.entities[0].id) : "");
  const draft = drafts[selectedEntityId] ?? data?.custom_data ?? {};
  const setDraft = (next: Record<string, string | number>) => setDrafts((current) => ({ ...current, [selectedEntityId]: next }));

  const save = async () => {
    if (!data?.entity) return; setSaving(true);
    try { await api(`/api/menus/${data.menu.id}/sheet`, { method: "POST", body: JSON.stringify({ entity_id: data.entity.id, data: draft }) }); toast("Workbook saved."); reload(); }
    catch (err) { toast(err instanceof ApiClientError ? err.message : "Failed to save workbook.", "error"); }
    finally { setSaving(false); }
  };
  const downloadCsv = () => {
    if (!data?.entity) return;
    const rows: Record<string, unknown>[] = data.menu.entity_type === "part" ? data.transactions : data.menu.columns.map((c) => ({ field: c.label, value: data.entity?.[c.key] ?? draft[c.key] ?? "" }));
    const headers = rows.length ? Object.keys(rows[0]) : ["field", "value"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((row) => headers.map((h) => esc(row[h])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = `${data.entity.name ?? "workbook"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const entity = data.entity;
  return <div>
    <PageHeader title={`${data.menu.icon} ${data.menu.name}`} subtitle={data.menu.description ?? "One spreadsheet-style workbook for each record."} actions={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={downloadCsv} disabled={!entity}>Download CSV</Button>{data.menu.entity_type === "part" && <><a href="/parts/stock-in" className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">+ Stock IN</a><a href="/parts/stock-out" className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">− Stock OUT</a></>}</div>} />
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Field label={`Choose ${data.menu.entity_type === "employee" ? "employee" : "product"}`}><Select value={selectedEntityId} onChange={(e) => setEntityId(e.target.value)}>{data.entities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field></div>
    {!entity ? <Card><p className="text-sm text-slate-500">No records are available in this menu yet.</p></Card> : <div className="space-y-5">
      <Card title={<span className="flex items-center gap-2"><Badge tone="cyan">{String(entity[data.menu.entity_type === "employee" ? "employee_code" : "part_code"] ?? "")}</Badge><span>{String(entity.name ?? entity.part_name ?? "")}</span></span>} actions={data.menu.entity_type === "part" ? <Badge tone={Number(entity.current_balance) <= 0 ? "red" : "green"}>Balance: {fmtNum(Number(entity.current_balance))} {String(entity.unit_of_measure ?? "")}</Badge> : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.menu.columns.map((column) => <Field key={column.key} label={column.label}><Input type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"} value={String(draft[column.key] ?? entity[column.key] ?? "")} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, [column.key]: column.type === "number" ? Number(e.target.value) : e.target.value })} /></Field>)}</div>
        {canEdit && <div className="mt-4 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save workbook"}</Button></div>}
      </Card>
      {data.menu.entity_type === "part" ? <Card title="Inventory ledger" actions={<span className="text-xs text-slate-500">Opening + IN − OUT = live balance</span>}><div className="overflow-x-auto"><table className="min-w-full border-collapse text-sm"><thead><tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="border border-slate-200 px-3 py-2">Date</th><th className="border border-slate-200 px-3 py-2">Type</th><th className="border border-slate-200 px-3 py-2">Quantity</th><th className="border border-slate-200 px-3 py-2">Source / destination</th><th className="border border-slate-200 px-3 py-2">Reference</th><th className="border border-slate-200 px-3 py-2 text-right">Balance</th></tr></thead><tbody>{data.transactions.map((row) => <tr key={String(row.id)}><td className="border border-slate-200 px-3 py-2">{fmtDate(String(row.transaction_date))}</td><td className="border border-slate-200 px-3 py-2"><Badge tone={row.transaction_type === "IN" ? "green" : row.transaction_type === "OUT" ? "red" : "blue"}>{String(row.transaction_type)}</Badge></td><td className="border border-slate-200 px-3 py-2">{fmtNum(Number(row.quantity))}</td><td className="border border-slate-200 px-3 py-2">{String(row.source ?? row.destination ?? "—")}</td><td className="border border-slate-200 px-3 py-2">{String(row.reference_number ?? "—")}</td><td className="border border-slate-200 px-3 py-2 text-right font-semibold">{fmtNum(Number(row.balance_after))}</td></tr>)}</tbody><tfoot><tr className="bg-teal-50 font-bold text-slate-900"><td colSpan={5} className="border border-slate-200 px-3 py-2 text-right">Current balance</td><td className="border border-slate-200 px-3 py-2 text-right">{fmtNum(Number(entity.current_balance))}</td></tr></tfoot></table></div></Card> : <Card title="Workbook notes"><p className="mb-3 text-xs text-slate-500">Use the custom fields above for anything you want to keep with this person.</p>{data.menu.columns.filter((c) => c.type === "textarea").map((column) => <Field key={column.key} label={column.label}><Textarea value={String(draft[column.key] ?? "")} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, [column.key]: e.target.value })} /></Field>)}</Card>}
    </div>}
  </div>;
}
