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

interface UnitOption {
  id: number;
  unit_name: string;
  unit_code: string;
}
interface Floor {
  id: number;
  unit_id: number;
  floor_name: string;
  floor_number: number;
  description: string | null;
  unit_name: string;
  machine_count: number;
}

const emptyForm = { unit_id: "", floor_name: "", floor_number: "", description: "" };

export default function FloorsPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data: unitsData } = useApi<{ items: UnitOption[] }>("/api/units");
  const [unitFilter, setUnitFilter] = useState("");
  const { data, loading, error, reload } = useApi<{ items: Floor[] }>(
    `/api/floors${unitFilter ? `?unit_id=${unitFilter}` : ""}`,
    [unitFilter]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Floor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Floor | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const perms = me?.user.permissions ?? [];
  const canCreate = perms.includes("machine.create");
  const canEdit = perms.includes("machine.edit");
  const canDelete = perms.includes("machine.delete");

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, unit_id: unitFilter });
    setModalOpen(true);
  };
  const openEdit = (f: Floor) => {
    setEditing(f);
    setForm({
      unit_id: String(f.unit_id),
      floor_name: f.floor_name,
      floor_number: String(f.floor_number),
      description: f.description ?? "",
    });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, floor_number: Number(form.floor_number) };
      if (editing) {
        await api(`/api/floors/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Floor updated.");
      } else {
        await api("/api/floors", { method: "POST", body: JSON.stringify(payload) });
        toast("Floor created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save floor.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/floors/${deleting.id}`, { method: "DELETE" });
      toast("Floor deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to delete floor.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Floors"
        subtitle="Floors belong to a unit (e.g. Unit 1 → 3rd Floor)."
        actions={canCreate ? <Button onClick={openCreate}>+ Add Floor</Button> : undefined}
      />

      <div className="mb-4 max-w-xs">
        <Field label="Filter by unit">
          <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">All units</option>
            {(unitsData?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_name} ({u.unit_code})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="🏢" title="No floors found" message="Add a floor for the selected unit." />
        ) : (
          <Table headers={["Unit", "Floor", "No.", "Machines", "Description", "Actions"]}>
            {data.items.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium text-slate-800">{f.unit_name}</Td>
                <Td>{f.floor_name}</Td>
                <Td>
                  <Badge tone="slate">{f.floor_number}</Badge>
                </Td>
                <Td className="font-semibold">{f.machine_count}</Td>
                <Td className="max-w-[220px] truncate">{f.description ?? "—"}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    {canEdit && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(f)}>
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="danger" onClick={() => setDeleting(f)}>
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
        title={editing ? "Edit Floor" : "Add Floor"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="floor-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="floor-form" onSubmit={save} className="space-y-4">
          <Field label="Unit" required>
            <Select
              value={form.unit_id}
              onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              required
            >
              <option value="">Select unit…</option>
              {(unitsData?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_name} ({u.unit_code})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Floor name" required>
              <Input
                value={form.floor_name}
                onChange={(e) => setForm({ ...form, floor_name: e.target.value })}
                placeholder="e.g. 3rd Floor"
                required
              />
            </Field>
            <Field label="Floor number" required hint="0 = ground floor">
              <Input
                type="number"
                min={0}
                value={form.floor_number}
                onChange={(e) => setForm({ ...form, floor_number: e.target.value })}
                placeholder="3"
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
        title="Delete floor?"
        message={
          <>
            Delete <b>{deleting?.floor_name}</b>?
            {deleting && deleting.machine_count > 0 && (
              <p className="mt-2 text-rose-600">
                This floor has {deleting.machine_count} machines — it cannot be deleted until
                they are moved or removed.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
