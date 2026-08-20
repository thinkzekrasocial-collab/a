"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiClientError, fmtNum, queryString, useApi } from "@/lib/api";
import { Button, ErrorBox, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Column = { key: string; label: string; type: "text" | "number" | "date" | "textarea" };
interface Menu { id: number; name: string; entity_type: "employee" | "part"; icon: string; description: string | null; columns: Column[]; }
interface Entity { id: number; code: string; name: string; label: string; current_balance?: number; unit_of_measure?: string; }
interface SheetResponse { menu: Menu; entities: Entity[]; entity: Record<string, unknown> | null; custom_data: Record<string, unknown>; transactions: Record<string, unknown>[]; }
interface SheetRow { id: number; date: string; balance: string; out: string; given: string; }

const emptyRow = (id: number): SheetRow => ({ id, date: "", balance: "", out: "0", given: "" });
const emptyRows = () => Array.from({ length: 6 }, (_, index) => emptyRow(index + 1));

function storedRows(customData: Record<string, unknown> | undefined): SheetRow[] {
  const rows = customData?.sheet_rows;
  if (!Array.isArray(rows) || rows.length === 0) return emptyRows();
  return rows.map((row, index) => ({
    id: Number((row as Partial<SheetRow>).id) || index + 1,
    date: String((row as Partial<SheetRow>).date ?? ""),
    balance: String((row as Partial<SheetRow>).balance ?? ""),
    out: String((row as Partial<SheetRow>).out ?? "0"),
    given: String((row as Partial<SheetRow>).given ?? ""),
  }));
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function WorkbookPage() {
  const params = useParams<{ menuId: string }>();
  const { toast } = useToast();
  const [entityId, setEntityId] = useState("");
  const [rows, setRows] = useState<SheetRow[]>(emptyRows);
  const [saving, setSaving] = useState(false);
  const path = useMemo(() => `/api/menus/${params.menuId}/sheet${queryString({ entity_id: entityId || undefined })}`, [params.menuId, entityId]);
  const { data, loading, error, reload } = useApi<SheetResponse>(path, [path]);
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const selectedEntityId = entityId || (data?.entities[0] ? String(data.entities[0].id) : "");
  const canEdit = data?.menu.entity_type === "employee" ? me?.user.permissions.includes("employee.edit") : me?.user.permissions.includes("part.edit");

  useEffect(() => {
    if (data) setRows(storedRows(data.custom_data));
  }, [data, selectedEntityId]);

  const calculations = useMemo(() => {
    let previous = 0;
    return rows.map((row) => {
      const balance = numberValue(row.balance);
      const given = numberValue(row.given);
      const out = numberValue(row.out);
      const inBalance = previous + balance + given;
      const total = inBalance;
      const remained = total - out;
      previous = remained;
      return { balance, given, out, inBalance, total, remained };
    });
  }, [rows]);

  const updateRow = (id: number, key: keyof Omit<SheetRow, "id">, value: string) => setRows((current) => current.map((row) => row.id === id ? { ...row, [key]: value } : row));
  const addRow = () => setRows((current) => [...current, emptyRow(Math.max(0, ...current.map((row) => row.id)) + 1)]);

  const save = async () => {
    if (!data?.entity) return;
    setSaving(true);
    try {
      await api(`/api/menus/${data.menu.id}/sheet`, { method: "POST", body: JSON.stringify({ entity_id: data.entity.id, data: { ...(data.custom_data ?? {}), sheet_rows: rows } }) });
      toast("Sheet saved.");
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save sheet.", "error");
    } finally { setSaving(false); }
  };

  const downloadCsv = () => {
    const headers = ["Date", "Balance (new)", "Out", "Given", "In balance", "Total balance", "Remained"];
    const body = rows.map((row, index) => [row.date, row.balance, row.out, row.given, calculations[index].inBalance, calculations[index].total, calculations[index].remained]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...body].map((line) => line.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${data?.menu.name ?? "sheet"}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (loading && !data) return <Spinner label="Loading sheet…" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const entity = data.entity;
  const previousRemained = 0;
  const finalRemained = calculations.at(-1)?.remained ?? 0;
  const added = rows.reduce((sum, row) => sum + numberValue(row.balance) + numberValue(row.given), 0);
  const totalOut = rows.reduce((sum, row) => sum + numberValue(row.out), 0);

  return <div className="animate-fade-in-up">
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#e4e1da] bg-white text-[11px]">◐</span>{data.menu.name || "Sheet1"}</div>
      <span className="rounded-full bg-[#efeee9] px-3 py-1 text-[11px] text-[#77756f]">{rows.length} rows</span>
      <Select aria-label="Choose product" value={selectedEntityId} onChange={(event) => setEntityId(event.target.value)} className="h-7 w-auto min-w-[170px] rounded-full border-[#e4e1da] bg-[#f2f1ed] px-3 py-1 text-[11px] text-[#77756f]">
        {data.entities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </Select>
      <span className="rounded-full bg-[#242424] px-3 py-1.5 text-[11px] font-medium text-white">Fixed</span>
      <div className="ml-auto flex gap-2"><Button size="sm" variant="secondary" onClick={downloadCsv}>Download CSV</Button>{canEdit && <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}</div>
    </div>

    {!entity ? <div className="rounded-2xl border border-[#e3e1db] bg-white p-10 text-center text-sm text-[#77756f]">No records are available in this sheet yet.</div> : <>
      <div className="overflow-hidden rounded-2xl border border-[#dedcd6] bg-white shadow-[0_2px_8px_rgba(38,36,30,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-[#e7e5e0] bg-[#fbfaf7] text-left text-[10px] uppercase tracking-[0.08em] text-[#77756f]"><th className="w-[16%] px-4 py-3.5 font-medium">Date</th><th className="w-[16%] px-3 py-3.5 font-medium">Balance <span className="normal-case tracking-normal text-[#9a9891]">(new)</span></th><th className="w-[10%] px-3 py-3.5 font-medium">Out</th><th className="w-[14%] px-3 py-3.5 font-medium">Given</th><th className="w-[15%] px-3 py-3.5 font-medium">In balance</th><th className="w-[16%] px-3 py-3.5 font-medium">Total balance</th><th className="w-[15%] px-3 py-3.5 font-medium">Remained</th></tr></thead>
            <tbody>{rows.map((row, index) => { const calc = calculations[index]; return <tr key={row.id} className="border-b border-[#efeee9] last:border-b-0"><td className="px-4 py-2"><div className="flex items-center gap-2"><Input aria-label={`Date row ${index + 1}`} type="date" value={row.date} disabled={!canEdit} onChange={(event) => updateRow(row.id, "date", event.target.value)} className="sheet-input min-w-[135px] border-0 bg-transparent px-0 shadow-none" /><span className="text-[#77756f]">▣</span></div></td><td className="px-3 py-2"><Input aria-label={`Balance row ${index + 1}`} type="number" value={row.balance} disabled={!canEdit} onChange={(event) => updateRow(row.id, "balance", event.target.value)} placeholder={index ? "prev: 0" : ""} className="sheet-input" /></td><td className="px-3 py-2"><Input aria-label={`Out row ${index + 1}`} type="number" value={row.out} disabled={!canEdit} onChange={(event) => updateRow(row.id, "out", event.target.value)} className="sheet-input" /></td><td className="px-3 py-2"><Input aria-label={`Given row ${index + 1}`} type="number" value={row.given} disabled={!canEdit} onChange={(event) => updateRow(row.id, "given", event.target.value)} className="sheet-input" /></td><td className="px-3 py-2"><div className="sheet-output">{fmtNum(calc.inBalance)}</div></td><td className="px-3 py-2"><div className="sheet-output text-[#42413d]">{fmtNum(calc.total)} <span className="text-[10px] text-[#8f8d86]">{index ? `0 - ${fmtNum(calc.out)}` : "open-out"}</span></div></td><td className="px-3 py-2"><div className="sheet-output font-semibold text-[#242424]">{fmtNum(calc.remained)}</div></td></tr>; })}</tbody>
          </table>
        </div>
        <div className="border-t border-[#e7e5e0] bg-[#fbfaf7] px-7 py-3.5 text-[11px] text-[#77756f]"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span>Previous Remained: <b className="rounded-full bg-white px-2 py-1 text-[#242424]">{fmtNum(previousRemained)}</b></span><span className="text-[#c2c0b9]">•</span><span>New Added (Balance+In): <b className="rounded-full bg-white px-2 py-1 text-[#242424]">+{fmtNum(added)}</b></span><span className="text-[#c2c0b9]">•</span><span>After Out: <b className="rounded-full bg-[#242424] px-2 py-1 text-white">{fmtNum(totalOut)}</b></span><span className="text-[#c2c0b9]">•</span><span>Final Remained: <b className="rounded-full bg-white px-2 py-1 text-[#242424]">{fmtNum(finalRemained)}</b></span></div><div className="mt-4 flex justify-end text-[11px] text-[#77756f]"><span className="mr-1.5 text-[#25b889]">●</span>Logic: Remainedₙ = (Remainedₙ₋₁ + Balanceₙ) − Outₙ + Inₙ · continues minus from prev</div></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><button className="rounded-full bg-[#242424] px-4 py-2 text-xs font-medium text-white">{data.menu.name || "Sheet1"}⌄</button><button onClick={addRow} disabled={!canEdit} className="rounded-full border border-dashed border-[#c8c5bd] bg-transparent px-4 py-2 text-xs text-[#6e6c66] hover:border-[#242424] hover:text-[#242424]">+ New Parts Sheet</button><Button size="sm" variant="ghost" className="ml-auto" onClick={addRow} disabled={!canEdit}>+ Add Row</Button></div>
      <p className="mt-5 text-[11px] leading-6 text-[#8d8b84]">Blank sheets — no pre-filled parts. Type Balance only when new stock arrives; it will be added to previous remained automatically. Out always minuses from running total.</p>
      <p className="mt-1 text-[11px] leading-6 text-[#aaa8a1]">Logic fixed: if Balance typed in row &gt;0, new = prevRemained + Balance. Remained = (prev+Balance) − Out + In. If Balance blank, uses prev only.</p>
    </>}
  </div>;
}
