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
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Employee {
  id: number;
  employee_code: string;
  name: string;
  phone: string | null;
  nid_number: string | null;
  city: string | null;
  designation: string | null;
  department: string | null;
  joining_date: string | null;
  offdays_taken: number;
  offdays_left: number;
  status: string;
}

const emptyForm = {
  employee_code: "",
  name: "",
  phone: "",
  nid_number: "",
  city: "",
  designation: "",
  department: "",
  joining_date: "",
  offdays_taken: "0",
  offdays_left: "0",
  status: "active",
};

export default function EmployeesPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { permissions: string[] } }>("/api/auth/me");
  const perms = me?.user.permissions ?? [];
  const canCreate = perms.includes("employee.create");
  const canEdit = perms.includes("employee.edit");
  const canDelete = perms.includes("employee.delete");

  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const path = useMemo(
    () => `/api/employees${queryString({ q, department, status, page, limit: 10 })}`,
    [q, department, status, page]
  );
  const { data, loading, error, reload } = useApi<{
    items: Employee[];
    total: number;
    page: number;
    limit: number;
    departments: string[];
  }>(path, [path]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      employee_code: e.employee_code,
      name: e.name,
      phone: e.phone ?? "",
      nid_number: e.nid_number ?? "",
      city: e.city ?? "",
      designation: e.designation ?? "",
      department: e.department ?? "",
      joining_date: e.joining_date ?? "",
      offdays_taken: String(e.offdays_taken ?? 0),
      offdays_left: String(e.offdays_left ?? 0),
      status: e.status,
    });
    setModalOpen(true);
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/employees/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Employee updated.");
      } else {
        await api("/api/employees", { method: "POST", body: JSON.stringify(form) });
        toast("Employee created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save employee.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/employees/${deleting.id}`, { method: "DELETE" });
      toast("Employee deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to delete employee.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Employee contact, department and leave information."
        actions={canCreate ? <Button onClick={openCreate}>+ Add Employee</Button> : undefined}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <Field label="Search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name, ID, designation…"
          />
        </Field>
        <Field label="Department">
          <Select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {(data?.departments ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
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
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="👷" title="No employees found" message="Add your first employee." />
        ) : (
          <>
            <Table
              headers={[
                "Employee ID",
                "Name",
                "Phone",
                "NID number",
                "Designation",
                "Department",
                "Joined",
                "City",
                "Off days",
                "Status",
                "Actions",
              ]}
            >
              {data.items.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <Badge tone="cyan">{e.employee_code}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-800">{e.name}</Td>
                  <Td>{e.phone ?? "—"}</Td>
                  <Td>{e.nid_number ?? "—"}</Td>
                  <Td>{e.designation ?? "—"}</Td>
                  <Td>{e.department ?? "—"}</Td>
                  <Td>{fmtDate(e.joining_date)}</Td>
                  <Td>{e.city ?? "—"}</Td>
                  <Td>
                    {e.offdays_taken ?? 0} taken · {e.offdays_left ?? 0} left
                  </Td>
                  <Td>
                    <Badge tone={e.status === "active" ? "green" : "slate"}>
                      {e.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {canEdit && (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="danger" onClick={() => setDeleting(e)}>
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
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Employee" : "Add Employee"}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Employee ID" required>
            <Input
              value={form.employee_code}
              onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
              placeholder="e.g. EMP-007"
              required
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="01XXX-XXXXXX"
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="e.g. Dhaka"
            />
          </Field>
          <Field label="NID number">
            <Input
              value={form.nid_number}
              onChange={(e) => setForm({ ...form, nid_number: e.target.value })}
              placeholder="National ID number"
            />
          </Field>
          <Field label="Designation">
            <Input
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              placeholder="e.g. Machine Operator"
            />
          </Field>
          <Field label="Department">
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="e.g. Production"
              list="dept-list"
            />
            <datalist id="dept-list">
              {(data?.departments ?? []).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Joining date">
            <Input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
            />
          </Field>
          <Field label="Off days taken">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.offdays_taken}
              onChange={(e) => setForm({ ...form, offdays_taken: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Off days left">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.offdays_left}
              onChange={(e) => setForm({ ...form, offdays_left: e.target.value })}
              placeholder="0"
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
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        title="Delete employee?"
        message={
          <>
            Delete employee <b>{deleting?.name}</b> ({deleting?.employee_code})? This cannot be
            undone.
          </>
        }
      />
    </div>
  );
}
