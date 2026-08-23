"use client";

import { useState, type FormEvent } from "react";
import { api, ApiClientError, useApi } from "@/lib/api";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";

type EntityType = "employee" | "part";
type ColumnType = "text" | "number" | "date" | "textarea";
interface MenuColumn { key: string; label: string; type: ColumnType; }
interface Menu { id: number; name: string; entity_type: EntityType; icon: string; description: string | null; columns: MenuColumn[]; sort_order: number; is_active: number; }

const defaults: Record<EntityType, MenuColumn[]> = {
  employee: [
    { key: "phone", label: "Phone", type: "text" },
    { key: "nid_number", label: "NID number", type: "text" },
    { key: "designation", label: "Designation", type: "text" },
    { key: "department", label: "Department", type: "text" },
    { key: "joining_date", label: "Joining date", type: "date" },
    { key: "city", label: "City", type: "text" },
    { key: "offdays_taken", label: "Off days taken", type: "number" },
    { key: "offdays_left", label: "Off days left", type: "number" },
  ],
  part: [
    { key: "category", label: "Category", type: "text" },
    { key: "supplier", label: "Supplier", type: "text" },
    { key: "minimum_stock", label: "Minimum stock", type: "number" },
  ],
};

const blank = { name: "", entity_type: "employee" as EntityType, icon: "📋", description: "", sort_order: "0", is_active: true, columns: defaults.employee };

export default function MenusPage() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi<{ items: Menu[] }>("/api/menus");
  const [editing, setEditing] = useState<Menu | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Menu | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = (type: EntityType = "employee") => {
    setEditing(null);
    setFormOpen(true);
    setForm({ ...blank, entity_type: type, columns: defaults[type].map((c) => ({ ...c })) });
  };
  const openEdit = (menu: Menu) => {
    setEditing(menu);
    setFormOpen(true);
    setForm({ name: menu.name, entity_type: menu.entity_type, icon: menu.icon, description: menu.description ?? "", sort_order: String(menu.sort_order), is_active: menu.is_active === 1, columns: menu.columns.map((c) => ({ ...c })) });
  };
  const updateType = (entity_type: EntityType) => setForm((f) => ({ ...f, entity_type, columns: f.columns.length ? f.columns : defaults[entity_type].map((c) => ({ ...c })) }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const body = { name: form.name, entity_type: form.entity_type, icon: form.icon, description: form.description, sort_order: Number(form.sort_order), is_active: form.is_active, columns: form.columns };
      await api(editing ? `/api/menus/${editing.id}` : "/api/menus", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      toast(editing ? "Menu updated." : "Menu created."); setEditing(null); setFormOpen(false); reload();
    } catch (err) { toast(err instanceof ApiClientError ? err.message : "Failed to save menu.", "error"); }
    finally { setSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleting) return; setDeleteBusy(true);
    try { await api(`/api/menus/${deleting.id}`, { method: "DELETE" }); toast("Menu deleted."); setDeleting(null); reload(); }
    catch (err) { toast(err instanceof ApiClientError ? err.message : "Failed to delete menu.", "error"); }
    finally { setDeleteBusy(false); }
  };
  const addColumn = () => setForm((f) => ({ ...f, columns: [...f.columns, { key: `field_${f.columns.length + 1}`, label: "New field", type: "text" }] }));
  const updateColumn = (index: number, patch: Partial<MenuColumn>) => setForm((f) => ({ ...f, columns: f.columns.map((c, i) => i === index ? { ...c, ...patch } : c) }));
  const removeColumn = (index: number) => setForm((f) => ({ ...f, columns: f.columns.filter((_, i) => i !== index) }));

  return <div>
    <PageHeader title="Workbook Menus" subtitle="Create menus for employees or products. Each record opens as its own spreadsheet-style workbook." actions={<Button onClick={() => openCreate()}>+ Create menu</Button>} />
    <Card className="mb-5 border-teal-100 bg-teal-50/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold text-slate-900">Start with a ready-made menu</p><p className="mt-1 text-sm text-slate-600">The product workbook keeps its balance tied to the stock ledger, so every IN and OUT updates automatically.</p></div>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => openCreate("employee")}>👷 Employees</Button><Button size="sm" variant="secondary" onClick={() => openCreate("part")}>🧩 Products</Button></div>
      </div>
    </Card>
    {loading ? <Spinner /> : error ? <ErrorBox message={error} /> : !data?.items.length ? <EmptyState icon="📋" title="No custom menus yet" message="Create an Employees or Products menu to generate one workbook per record." /> : <div className="grid gap-4 md:grid-cols-2">
      {data.items.map((menu) => <Card key={menu.id} title={<span className="flex items-center gap-2"><span className="text-xl">{menu.icon}</span>{menu.name}{menu.is_active === 1 ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Hidden</Badge>}</span>} actions={<div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => openEdit(menu)}>Edit</Button><Button size="sm" variant="danger" onClick={() => setDeleting(menu)}>Delete</Button></div>}>
        <p className="text-sm text-slate-600">{menu.description || `One workbook for every ${menu.entity_type === "employee" ? "employee" : "product"}.`}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Badge tone="cyan">{menu.entity_type === "employee" ? "Employees" : "Products"}</Badge><Badge tone="slate">{menu.columns.length} custom fields</Badge><a className="text-sm font-medium text-teal-700 hover:underline" href={`/workbooks/${menu.id}`}>Open workbooks →</a></div>
      </Card>)}
    </div>}

    <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? "Edit workbook menu" : "Create workbook menu"} wide footer={<><Button variant="secondary" onClick={() => { setFormOpen(false); setEditing(null); }} disabled={saving}>Cancel</Button><Button type="submit" form="menu-form" disabled={saving}>{saving ? "Saving…" : "Save menu"}</Button></>}>
      <form id="menu-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_110px_180px]">
          <Field label="Menu name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Warehouse Products" required /></Field>
          <Field label="Icon"><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value.slice(0, 4) })} /></Field>
          <Field label="Records from" required><Select value={form.entity_type} onChange={(e) => updateType(e.target.value as EntityType)}><option value="employee">Employees</option><option value="part">Products</option></Select></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this workbook is for" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field><Field label="Status"><Select value={form.is_active ? "active" : "hidden"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}><option value="active">Active</option><option value="hidden">Hidden</option></Select></Field></div></div>
        <div><div className="mb-2 flex items-center justify-between"><div><h4 className="text-sm font-semibold text-slate-800">Custom columns</h4><p className="text-xs text-slate-500">These fields are saved separately for every employee or product workbook.</p></div><Button size="sm" variant="secondary" onClick={addColumn}>+ Add column</Button></div><div className="space-y-2">{form.columns.map((column, index) => <div key={`${index}-${column.key}`} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[1fr_1.3fr_150px_auto]"><Input aria-label="Column key" value={column.key} onChange={(e) => updateColumn(index, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })} placeholder="field_key" /><Input aria-label="Column label" value={column.label} onChange={(e) => updateColumn(index, { label: e.target.value })} placeholder="Column label" /><Select aria-label="Column type" value={column.type} onChange={(e) => updateColumn(index, { type: e.target.value as ColumnType })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="textarea">Long text</option></Select><Button size="sm" variant="ghost" onClick={() => removeColumn(index)} aria-label="Remove column">✕</Button></div>)}</div></div>
      </form>
    </Modal>
    <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} onConfirm={confirmDelete} busy={deleteBusy} title="Delete workbook menu?" message={<>Delete <b>{deleting?.name}</b>? Saved sheet notes for its records will also be removed.</>} />
  </div>;
}
