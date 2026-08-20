"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, ApiClientError, fmtDate, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  machineStatusTone,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import { MACHINE_STATUSES } from "@/lib/constants";

interface Option {
  id: number;
  [key: string]: unknown;
  name?: string;
  unit_name?: string;
  unit_code?: string;
  floor_name?: string;
  floor_number?: number;
}

interface Machine {
  id: number;
  machine_code: string;
  machine_name: string;
  machine_type_id: number | null;
  unit_id: number | null;
  floor_id: number | null;
  model: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  installation_date: string | null;
  status: string;
  description: string | null;
  machine_type_name: string | null;
  unit_name: string | null;
  floor_name: string | null;
  floor_number: number | null;
}

const emptyForm = {
  machine_code: "",
  machine_name: "",
  machine_type_id: "",
  unit_id: "",
  floor_id: "",
  model: "",
  serial_number: "",
  manufacturer: "",
  installation_date: "",
  status: "Running",
  description: "",
};

export default function MachinesPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const { data: unitsData } = useApi<{ items: Option[] }>("/api/units");
  const { data: typesData } = useApi<{ items: Option[] }>("/api/machine-types");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [unitId, setUnitId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [page, setPage] = useState(1);

  const { data: floorsData } = useApi<{ items: Option[] }>(
    unitId ? `/api/floors?unit_id=${unitId}` : null,
    [unitId]
  );

  const path = useMemo(
    () =>
      `/api/machines${queryString({ q, status, unit_id: unitId, floor_id: floorId, type_id: typeId, page, limit: 10 })}`,
    [q, status, unitId, floorId, typeId, page]
  );
  const { data, loading, error, reload } = useApi<{
    items: Machine[];
    total: number;
    page: number;
    limit: number;
  }>(path, [path]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Machine | null>(null);
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
  const openEdit = (m: Machine) => {
    setEditing(m);
    setForm({
      machine_code: m.machine_code,
      machine_name: m.machine_name,
      machine_type_id: m.machine_type_id ? String(m.machine_type_id) : "",
      unit_id: m.unit_id ? String(m.unit_id) : "",
      floor_id: m.floor_id ? String(m.floor_id) : "",
      model: m.model ?? "",
      serial_number: m.serial_number ?? "",
      manufacturer: m.manufacturer ?? "",
      installation_date: m.installation_date ?? "",
      status: m.status,
      description: m.description ?? "",
    });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/machines/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Machine updated.");
      } else {
        await api("/api/machines", { method: "POST", body: JSON.stringify(form) });
        toast("Machine created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save machine.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/machines/${deleting.id}`, { method: "DELETE" });
      toast("Machine deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to delete machine.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const statusCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const m of data.items) counts[m.status] = (counts[m.status] ?? 0) + 1;
    return counts;
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Machines"
        subtitle="Search, filter and manage every machine in the factory."
        actions={canCreate ? <Button onClick={openCreate}>+ Add Machine</Button> : undefined}
      />

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Code, name, serial…"
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {MACHINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit">
          <Select
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value);
              setFloorId("");
              setPage(1);
            }}
          >
            <option value="">All units</option>
            {(unitsData?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Floor">
          <Select
            value={floorId}
            onChange={(e) => {
              setFloorId(e.target.value);
              setPage(1);
            }}
            disabled={!unitId}
          >
            <option value="">All floors</option>
            {(floorsData?.items ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.floor_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Machine type">
          <Select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {(typesData?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card
        title={
          <span>
            Machine List{" "}
            {data && (
              <Badge tone="cyan" className="ml-1">
                {data.total}
              </Badge>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(statusCounts).map(([s, n]) => (
              <Badge key={s} tone={machineStatusTone(s)}>
                {s}: {n}
              </Badge>
            ))}
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="⚙️" title="No machines found" message="Try adjusting the filters or add a machine." />
        ) : (
          <>
            <Table
              headers={[
                "Code",
                "Name",
                "Type",
                "Unit / Floor",
                "Model",
                "Serial",
                "Installed",
                "Status",
                "Actions",
              ]}
            >
              {data.items.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Badge tone="cyan">{m.machine_code}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-800">{m.machine_name}</Td>
                  <Td>{m.machine_type_name ?? "Unassigned"}</Td>
                  <Td>
                    {m.unit_name ?? "Unassigned"}
                    <span className="text-xs text-slate-400"> · {m.floor_name ?? "Unassigned"}</span>
                  </Td>
                  <Td>{m.model ?? "—"}</Td>
                  <Td className="text-xs text-slate-500">{m.serial_number ?? "—"}</Td>
                  <Td>{fmtDate(m.installation_date)}</Td>
                  <Td>
                    <Badge tone={machineStatusTone(m.status)}>{m.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {canEdit && (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(m)}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="danger" onClick={() => setDeleting(m)}>
                          Delete
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
              onChange={(p) => {
                setPage(p);
              }}
            />
          </>
        )}
      </Card>

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Machine" : "Add Machine"}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="machine-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="machine-form" onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Machine code" required>
            <Input
              value={form.machine_code}
              onChange={(e) => setForm({ ...form, machine_code: e.target.value })}
              placeholder="e.g. OVR-3F-003"
              required
            />
          </Field>
          <Field label="Machine name" required>
            <Input
              value={form.machine_name}
              onChange={(e) => setForm({ ...form, machine_name: e.target.value })}
              placeholder="e.g. Overlock Machine #5"
              required
            />
          </Field>
          <Field label="Status" required>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {MACHINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model">
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. JUKI MO-6714S"
            />
          </Field>
          <Field label="Serial number">
            <Input
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
          </Field>
          <Field label="Manufacturer">
            <Input
              value={form.manufacturer}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              placeholder="e.g. JUKI Corporation"
            />
          </Field>
          <Field label="Installation date">
            <Input
              type="date"
              value={form.installation_date}
              onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
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
        title="Delete machine?"
        message={
          <>
            Delete machine <b>{deleting?.machine_name}</b> ({deleting?.machine_code})? Stock
            transaction history that references this machine is kept.
          </>
        }
      />
    </div>
  );
}
