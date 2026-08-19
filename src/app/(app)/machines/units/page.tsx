"use client";

import { useState, type FormEvent } from "react";
import { api, ApiClientError, useApi } from "@/lib/api";
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
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Unit {
  id: number;
  unit_name: string;
  unit_code: string;
  location: string | null;
  description: string | null;
  status: string;
  machine_count: number;
  floor_count: number;
}

const emptyForm = {
  unit_name: "",
  unit_code: "",
  location: "",
  description: "",
  status: "active",
};

export default function UnitsPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data, loading, error, reload } = useApi<{ items: Unit[] }>("/api/units");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const perms = me?.user.permissions ?? [];
  const canCreate = perms.includes("machine.create");
  const canEdit = perms.includes("machine.edit");
  const canDelete = perms.includes("machine.delete");

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (u: Unit) => {
    setEditing(u);
    setForm({
      unit_name: u.unit_name,
      unit_code: u.unit_code,
      location: u.location ?? "",
      description: u.description ?? "",
      status: u.status,
    });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/units/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast("Unit updated.");
      } else {
        await api("/api/units", { method: "POST", body: JSON.stringify(form) });
        toast("Unit created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save unit.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/units/${deleting.id}`, { method: "DELETE" });
      toast("Unit deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(
        err instanceof ApiClientError ? err.message : "Failed to delete unit.",
        "error"
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Units"
        subtitle="Company → Unit → Floor → Machine hierarchy starts here."
        actions={
          canCreate ? (
            <Button onClick={openCreate}>+ Add Unit</Button>
          ) : undefined
        }
      />

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="🏭" title="No units yet" message="Add your first production unit." />
        ) : (
          <Table headers={["Unit", "Code", "Location", "Floors", "Machines", "Status", "Actions"]}>
            {data.items.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium text-slate-800">{u.unit_name}</Td>
                <Td>
                  <Badge tone="cyan">{u.unit_code}</Badge>
                </Td>
                <Td>{u.location ?? "—"}</Td>
                <Td>{u.floor_count}</Td>
                <Td className="font-semibold">{u.machine_count}</Td>
                <Td>
                  <Badge tone={u.status === "active" ? "green" : "slate"}>
                    {u.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    {canEdit && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="danger" onClick={() => setDeleting(u)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Unit" : "Add Unit"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="unit-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="unit-form" onSubmit={save} className="space-y-4">
          <Field label="Unit name" required>
            <Input
              value={form.unit_name}
              onChange={(e) => setForm({ ...form, unit_name: e.target.value })}
              placeholder="e.g. Unit 1"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit code" required hint="Unique, e.g. U-01">
              <Input
                value={form.unit_code}
                onChange={(e) => setForm({ ...form, unit_code: e.target.value })}
                placeholder="U-01"
                required
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Location">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Gazipur, Dhaka"
            />
          </Field>
          <Field label="Description">
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
        title="Delete unit?"
        message={
          <>
            Delete unit <b>{deleting?.unit_name}</b> ({deleting?.unit_code})?
            {deleting && deleting.machine_count > 0 && (
              <p className="mt-2 text-rose-600">
                This unit has {deleting.machine_count} machines — it cannot be deleted until
                they are moved or removed.
              </p>
            )}
          </>
        }
      />

      <p className="mt-4 text-xs text-slate-400">
        Raw API: <code className="rounded bg-slate-100 px-1">GET /api/units</code> — the same
        endpoint powers this table.
      </p>
    </div>
  );
}
