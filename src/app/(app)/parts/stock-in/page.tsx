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
}

const today = () => new Date().toISOString().slice(0, 10);

export default function StockInPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");

  const { data: partsData, loading: partsLoading } = useApi<{ items: PartOption[] }>(
    "/api/parts?limit=100"
  );
  const perms = me?.user.permissions ?? [];

  const [form, setForm] = useState({
    part_id: searchParams.get("part_id") ?? "",
    quantity: "",
    transaction_date: today(),
    source: "",
    supplier: "",
    received_by: "",
    storage_location: "",
    reference_number: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const selectedPart = (partsData?.items ?? []).find(
    (p) => p.id === Number(form.part_id)
  );

  const { data: recentData, reload: reloadRecent } = useApi<{
    rows: {
      id: number;
      transaction_date: string;
      quantity: number;
      source: string | null;
      supplier: string | null;
      received_by: string | null;
      storage_location: string | null;
      reference_number: string | null;
      part_code: string;
      part_name: string;
      unit_of_measure: string;
      created_by_name: string;
    }[];
  }>(perms.includes("transaction.view") ? "/api/reports?type=stock-in" : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/stock/in", { method: "POST", body: JSON.stringify(form) });
      toast(
        `Stock IN recorded: +${fmtNum(form.quantity)} ${selectedPart?.unit_of_measure ?? ""}`
      );
      setForm({
        part_id: "",
        quantity: "",
        transaction_date: today(),
        source: "",
        supplier: "",
        received_by: "",
        storage_location: "",
        reference_number: "",
        note: "",
      });
      reloadRecent();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to record stock IN.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock IN"
        subtitle="Record a stock receipt. The balance updates automatically."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="New Stock IN" className="lg:col-span-1">
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
              <p className="text-xs text-slate-500">
                Current balance:{" "}
                <b>
                  {fmtNum(selectedPart.current_balance)} {selectedPart.unit_of_measure}
                </b>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 500"
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
            <Field label="Source">
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="e.g. Bangladesh"
              />
            </Field>
            <Field label="Supplier">
              <Input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="e.g. SS Threads Ltd."
              />
            </Field>
            <Field label="Received by">
              <Input
                value={form.received_by}
                onChange={(e) => setForm({ ...form, received_by: e.target.value })}
                placeholder="Person who received the stock"
              />
            </Field>
            <Field label="Storage location">
              <Input
                value={form.storage_location}
                onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                placeholder="e.g. Store Room A"
              />
            </Field>
            <Field label="Reference number">
              <Input
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                placeholder="e.g. INV-2201"
              />
            </Field>
            <Field label="Note">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Recording…" : "📥 Record Stock IN"}
            </Button>
          </form>
        </Card>

        <Card title="Recent Stock IN" className="lg:col-span-2">
          {!perms.includes("transaction.view") ? (
            <EmptyState
              icon="🔒"
              title="Transaction history hidden"
              message="Your role does not include transaction viewing."
            />
          ) : recentData === null ? (
            <Spinner />
          ) : recentData.rows.length === 0 ? (
            <EmptyState icon="📥" title="No stock IN yet" message="Receipts will appear here." />
          ) : (
            <Table headers={["Date", "Part", "Qty", "Source", "Supplier", "Received by", "Location", "Ref", "By"]}>
              {recentData.rows.slice(0, 12).map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.transaction_date)}</Td>
                  <Td className="font-medium text-slate-800">{t.part_name}</Td>
                  <Td className="font-semibold text-emerald-700">
                    +{fmtNum(t.quantity)} {t.unit_of_measure}
                  </Td>
                  <Td>{t.source ?? "—"}</Td>
                  <Td>{t.supplier ?? "—"}</Td>
                  <Td>{t.received_by ?? "—"}</Td>
                  <Td>{t.storage_location ?? "—"}</Td>
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
