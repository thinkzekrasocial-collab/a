"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, ApiClientError, fmtDateTime, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface RoleOption {
  id: number;
  name: string;
}
interface UserRow {
  id: number;
  name: string;
  username: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  roles: string | null;
}

export default function UsersPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { id: number; permissions: string[] } }>("/api/auth/me");
  const { data: rolesData } = useApi<{ items: RoleOption[] }>("/api/roles");

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const path = useMemo(() => `/api/users${queryString({ q, page, limit: 10 })}`, [q, page]);
  const { data, loading, error, reload } = useApi<{
    items: UserRow[];
    total: number;
    page: number;
    limit: number;
  }>(path, [path]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    roleIds: [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<UserRow | null>(null);

  const perms = me?.user.permissions ?? [];
  const myId = me?.user.id;
  const canCreate = perms.includes("user.create");
  const canEdit = perms.includes("user.edit");
  const canDisable = perms.includes("user.disable");

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", username: "", password: "", roleIds: [] });
    setModalOpen(true);
  };
  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      name: u.name,
      username: u.username,
      password: "",
      roleIds: [],
    });
    setModalOpen(true);
  };

  const toggleRole = (id: number) => {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id)
        ? f.roleIds.filter((r) => r !== id)
        : [...f.roleIds, id],
    }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/users/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...form, password: form.password || undefined }),
        });
        toast("User updated.");
      } else {
        await api("/api/users", { method: "POST", body: JSON.stringify(form) });
        toast("User created.");
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save user.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u: UserRow) => {
    setToggling(u);
    try {
      const res = await api<{ status: string }>(`/api/users/${u.id}/status`, {
        method: "POST",
      });
      toast(
        res.status === "disabled"
          ? `User "${u.username}" disabled.`
          : `User "${u.username}" enabled.`
      );
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to change user status.", "error");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="User accounts, roles and account status."
        actions={canCreate ? <Button onClick={openCreate}>+ Add User</Button> : undefined}
      />

      <div className="mb-4 max-w-sm">
        <Field label="Search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name or username…"
          />
        </Field>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="👤" title="No users found" message="Create the first user account." />
        ) : (
          <>
            <Table headers={["Name", "Username", "Roles", "Status", "Last Login", "Created", "Actions"]}>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-slate-800">{u.name}</Td>
                  <Td>{u.username}</Td>
                  <Td>
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {(u.roles ?? "").split(", ").filter(Boolean).map((r) => (
                        <Badge key={r} tone={r === "Super Admin" ? "violet" : "blue"}>
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={u.status === "active" ? "green" : "red"}>
                      {u.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{fmtDateTime(u.last_login_at)}</Td>
                  <Td className="text-slate-500">{fmtDateTime(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {canEdit && u.id !== myId && (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                      )}
                      {canDisable && u.id !== myId && (
                        <Button
                          size="sm"
                          variant={u.status === "active" ? "danger" : "success"}
                          disabled={toggling?.id === u.id}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === "active" ? "Disable" : "Enable"}
                        </Button>
                      )}
                      {u.id === myId && <Badge tone="slate">You</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit User — ${editing.username}` : "Add User"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={save} className="space-y-4">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </Field>
          <Field label="Username" required>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="login username"
              required
            />
          </Field>
          <Field
            label={editing ? "New password (leave blank to keep)" : "Password"}
            required={!editing}
            hint="Minimum 6 characters."
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required={!editing}
            />
          </Field>
          <Field label="Roles" required>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(rolesData?.items ?? []).map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
