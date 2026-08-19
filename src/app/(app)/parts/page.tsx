"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiClientError, fmtNum, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  stockLabel,
  stockTone,
  Table,
  Td,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import { UOM_OPTIONS } from "@/lib/constants";

interface Part {
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
}

const emptyForm = {
  part_code: "",
  part_name: "",
  category: "",
  unit_of_measure: "PCS",
  supplier: "",
  country_of_origin: "",
  minimum_stock: "",
  opening_stock: "",
  description: "",
};

export default function PartsPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [page, setPage] = useState(1);

  const path = useMemo(
    () =>
      `/api/parts${queryString({ q, category, stock, page, limit: 10 })}`,
    [q, category, stock, page]
  );
  const { data, loading, error, reload } = useApi<{
    items: Part[];
    total: number;
    page: number;
    limit: number;
    categories: string[];
  }>(path, [path]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Part | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const perms = me?.user.permissions ?? [];
  const canCreate = perms.includes("part.create");
  const canEdit = perms.includes("part.edit");
  const canDelete = perms.includes("part.delete");
  const canStockIn = perms.includes("stock.in");
  const canStockOut = perms.includes("stock.out");

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (p: Part) => {
    setEditing(p);
    setForm({
      part_code: p.part_code,
      part_name: p.part_name,
      category: p.category ?? "",
      unit_of_measure: p.unit_of_measure,
      supplier: p.supplier ?? "",
      country_of_origin: p.country_of_origin ?? "",
      minimum_stock: String(p.minimum_stock),
      opening_stock: String(p.opening_stock),
      description: p.description ?? "",
    });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/parts/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Part updated.");
      } else {
        await api("/api/parts", { method: "POST", body: JSON.stringify(form) });
        toast("Part created. Opening stock recorded in the ledger.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save part.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/parts/${deleting.id}`, { method: "DELETE" });
      toast("Part deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to delete part.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    return {
      totalQty: items.reduce((s, p) => s + Number(p.current_balance), 0),
      low: items.filter((p) => p.current_balance > 0 && p.current_balance < p.minimum_stock).length,
      out: items.filter((p) => p.current_balance <= 0).length,
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Parts List"
        subtitle="Current stock is always calculated from the ledger — opening + IN − OUT."
        actions={canCreate ? <Button onClick={openCreate}>+ Add Part</Button> : undefined}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Part name or code…"
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(data?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stock status">
          <Select
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Badge tone="cyan">On page: {fmtNum(totals.totalQty)}</Badge>
          {totals.low > 0 && <Badge tone="amber">{totals.low} low</Badge>}
          {totals.out > 0 && <Badge tone="red">{totals.out} out</Badge>}
        </div>
      </div>

      <Card
        title={
          <span>
            Parts{" "}
            {data && (
              <Badge tone="cyan" className="ml-1">
                {data.total}
              </Badge>
            )}
          </span>
        }
      >
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="🧩" title="No parts found" message="Adjust the filters or add your first part." />
        ) : (
          <>
            <Table
              headers={[
                "Code",
                "Part",
                "Category",
                "UoM",
                "Supplier",
                "Min",
                "Opening",
                "Current Balance",
                "Status",
                "Actions",
              ]}
            >
              {data.items.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Badge tone="cyan">{p.part_code}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-800">{p.part_name}</Td>
                  <Td>{p.category ?? "—"}</Td>
                  <Td>{p.unit_of_measure}</Td>
                  <Td className="max-w-[160px] truncate">{p.supplier ?? "—"}</Td>
                  <Td>{fmtNum(p.minimum_stock)}</Td>
                  <Td>{fmtNum(p.opening_stock)}</Td>
                  <Td className="font-bold text-slate-900">
                    {fmtNum(p.current_balance)}
                  </Td>
                  <Td>
                    <Badge tone={stockTone(p.current_balance, p.minimum_stock)}>
                      {stockLabel(p.current_balance, p.minimum_stock)}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {canStockIn && (
                        <Link href={`/parts/stock-in?part_id=${p.id}`}>
                          <Button size="sm" variant="success">
                            IN
                          </Button>
                        </Link>
                      )}
                      {canStockOut && (
                        <Link href={`/parts/stock-out?part_id=${p.id}`}>
                          <Button size="sm" variant="danger">
                            OUT
                          </Button>
                        </Link>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                          Del
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Part" : "Add Part"}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="part-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="part-form" onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Part code" required>
            <Input
              value={form.part_code}
              onChange={(e) => setForm({ ...form, part_code: e.target.value })}
              placeholder="e.g. PRT-007"
              required
            />
          </Field>
          <Field label="Part name" required>
            <Input
              value={form.part_name}
              onChange={(e) => setForm({ ...form, part_name: e.target.value })}
              placeholder="e.g. Afrodul"
              required
            />
          </Field>
          <Field label="Category">
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Thread"
              list="category-list"
            />
            <datalist id="category-list">
              {(data?.categories ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit of measure" required>
            <Select
              value={form.unit_of_measure}
              onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
            >
              {UOM_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier">
            <Input
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder="e.g. SS Threads Ltd."
            />
          </Field>
          <Field label="Country of origin">
            <Input
              value={form.country_of_origin}
              onChange={(e) => setForm({ ...form, country_of_origin: e.target.value })}
              placeholder="e.g. China"
            />
          </Field>
          <Field label="Minimum stock" hint="Part is flagged LOW below this level.">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.minimum_stock}
              onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field
            label="Opening balance"
            hint={editing ? "Locked after creation — use Stock IN/OUT." : "Recorded as an OPENING ledger entry."}
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.opening_stock}
              onChange={(e) => setForm({ ...form, opening_stock: e.target.value })}
              placeholder="0"
              disabled={!!editing}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        title="Delete part?"
        message={
          <>
            Delete part <b>{deleting?.part_name}</b> ({deleting?.part_code})? Parts with stock
            history cannot be deleted — the ledger must be preserved.
          </>
        }
      />
    </div>
  );
}
