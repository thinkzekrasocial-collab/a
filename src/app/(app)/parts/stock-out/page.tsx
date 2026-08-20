"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError, fmtDate, fmtNum, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface PartOption {
  id: number;
  part_code: string;
  part_name: string;
  unit_of_measure: string;
  current_balance: number;
  minimum_stock: number;
}
interface MachineOption {
  id: number;
  machine_code: string;
  machine_name: string;
  unit_name: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function StockOutPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const perms = me?.user.permissions ?? [];

  const { data: partsData, loading: partsLoading } = useApi<{ items: PartOption[] }>(
    "/api/parts?limit=100"
  );
  const { data: machinesData } = useApi<{ items: MachineOption[] }>(
    "/api/machines?limit=100"
  );

  const [form, setForm] = useState({
    part_id: searchParams.get("part_id") ?? "",
    quantity: "",
    transaction_date: today(),
    destination: "",
    machine_id: "",
    purpose: "",
    issued_by: "",
    work_order: "",
    reference_number: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const selectedPart = (partsData?.items ?? []).find(
    (p) => p.id === Number(form.part_id)
  );
  const wouldExceed =
    selectedPart && Number(form.quantity) > 0 && Number(form.quantity) > selectedPart.current_balance;

  const { data: recentData, reload: reloadRecent } = useApi<{
    rows: {
      id: number;
      transaction_date: string;
      quantity: number;
      destination: string | null;
      purpose: string | null;
      issued_by: string | null;
      work_order: string | null;
      reference_number: string | null;
      part_code: string;
      part_name: string;
      unit_of_measure: string;
      created_by_name: string;
      machine_code: string | null;
    }[];
  }>(perms.includes("transaction.view") ? "/api/reports?type=stock-out" : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPart) {
      toast("Select a part first.", "error");
      return;
    }
    if (wouldExceed) {
      toast(
        `Insufficient stock. Available balance: ${fmtNum(selectedPart.current_balance)} ${selectedPart.unit_of_measure}.`,
        "error"
      );
      return;
    }
    setSaving(true);
    try {
      await api("/api/stock/out", { method: "POST", body: JSON.stringify(form) });
      toast(
        `Stock OUT recorded: −${fmtNum(form.quantity)} ${selectedPart.unit_of_measure}`
      );
      setForm({
        part_id: "",
        quantity: "",
        transaction_date: today(),
        destination: "",
        machine_id: "",
        purpose: "",
        issued_by: "",
        work_order: "",
        reference_number: "",
        note: "",
      });
      reloadRecent();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to record stock OUT.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock OUT"
        subtitle="Issue stock to production. Insufficient stock is rejected."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="New Stock OUT" className="lg:col-span-1">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Part" required>
              <Select
                value={form.part_id}
                onChange={(e) => setForm({ ...form, part_id: e.target.value })}
                required
                disabled={partsLoading}
              >
                <option value="">Select part…</option>
                {(partsData?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.part_name} ({p.part_code}) — {p.unit_of_measure}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedPart && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">
                  Available:{" "}
                  <b>
                    {fmtNum(selectedPart.current_balance)} {selectedPart.unit_of_measure}
                  </b>
                </span>
                {wouldExceed ? (
                  <Badge tone="red">Insufficient stock</Badge>
                ) : (
                  <Badge tone="green">OK</Badge>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 30"
                  required
                />
              </Field>
              <Field label="Date" required>
                <Input
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="Destination">
              <Input
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Unit 1 — 3rd Floor"
              />
            </Field>
            <Field label="Machine (optional)">
              <Select
                value={form.machine_id}
                onChange={(e) => setForm({ ...form, machine_id: e.target.value })}
              >
                <option value="">No machine</option>
                {(machinesData?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.machine_name} ({m.machine_code}) — {m.unit_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Purpose">
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="e.g. Production"
              />
            </Field>
            <Field label="Issued by">
              <Input
                value={form.issued_by}
                onChange={(e) => setForm({ ...form, issued_by: e.target.value })}
                placeholder="Person who issued the stock"
              />
            </Field>
            <Field label="Work order">
              <Input
                value={form.work_order}
                onChange={(e) => setForm({ ...form, work_order: e.target.value })}
                placeholder="e.g. WO-2026-004"
              />
            </Field>
            <Field label="Reference number">
              <Input
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                placeholder="e.g. OUT-1060"
              />
            </Field>
            <Field label="Note">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={saving} variant="danger" className="w-full">
              {saving ? "Recording…" : "📤 Record Stock OUT"}
            </Button>
          </form>
        </Card>

        <Card title="Recent Stock OUT" className="lg:col-span-2">
          {!perms.includes("transaction.view") ? (
            <EmptyState
              icon="🔒"
              title="Transaction history hidden"
              message="Your role does not include transaction viewing."
            />
          ) : recentData === null ? (
            <Spinner />
          ) : recentData.rows.length === 0 ? (
            <EmptyState icon="📤" title="No stock OUT yet" message="Issues will appear here." />
          ) : (
            <Table headers={["Date", "Part", "Qty", "Destination", "Machine", "Issued by", "Work order", "Ref", "By"]}>
              {recentData.rows.slice(0, 12).map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.transaction_date)}</Td>
                  <Td className="font-medium text-slate-800">{t.part_name}</Td>
                  <Td className="font-semibold text-rose-700">
                    −{fmtNum(t.quantity)} {t.unit_of_measure}
                  </Td>
                  <Td>{t.destination ?? "—"}</Td>
                  <Td>{t.machine_code ?? "—"}</Td>
                  <Td>{t.issued_by ?? "—"}</Td>
                  <Td>{t.work_order ?? "—"}</Td>
                  <Td>
                    {t.reference_number ? <Badge tone="slate">{t.reference_number}</Badge> : "—"}
                  </Td>
                  <Td className="text-slate-500">{t.created_by_name}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
