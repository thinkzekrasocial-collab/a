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
  Spinner,
  Table,
  Td,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface MachineType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  machine_count: number;
}

const emptyForm = { name: "", code: "", description: "" };

export default function MachineTypesPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data, loading, error, reload } = useApi<{ items: MachineType[] }>("/api/machine-types");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MachineType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MachineType | null>(null);
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
  const openEdit = (t: MachineType) => {
    setEditing(t);
    setForm({ name: t.name, code: t.code, description: t.description ?? "" });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/machine-types/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Machine type updated.");
      } else {
        await api("/api/machine-types", { method: "POST", body: JSON.stringify(form) });
        toast("Machine type created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save machine type.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/machine-types/${deleting.id}`, { method: "DELETE" });
      toast("Machine type deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(
        err instanceof ApiClientError ? err.message : "Failed to delete machine type.",
        "error"
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Machine Types"
        subtitle="Overlock, Filling, Mask, Sewing, Cutting…"
        actions={canCreate ? <Button onClick={openCreate}>+ Add Type</Button> : undefined}
      />

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="🏷️" title="No machine types yet" message="Add types like Overlock or Filling." />
        ) : (
          <Table headers={["Name", "Code", "Machines", "Description", "Actions"]}>
            {data.items.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium text-slate-800">{t.name}</Td>
                <Td>
                  <Badge tone="cyan">{t.code}</Badge>
                </Td>
                <Td className="font-semibold">{t.machine_count}</Td>
                <Td className="max-w-[260px] truncate">{t.description ?? "—"}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    {canEdit && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="danger" onClick={() => setDeleting(t)}>
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
        title={editing ? "Edit Machine Type" : "Add Machine Type"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="type-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="type-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Overlock"
                required
              />
            </Field>
            <Field label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. OVR"
                required
              />
            </Field>
          </div>
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
        title="Delete machine type?"
        message={
          <>
            Delete machine type <b>{deleting?.name}</b>?
            {deleting && deleting.machine_count > 0 && (
              <p className="mt-2 text-rose-600">
                {deleting.machine_count} machines use this type — it cannot be deleted until they
                are reassigned.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
