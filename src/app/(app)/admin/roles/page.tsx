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
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: number;
  user_count: number;
  permissions: string[];
}

interface PermissionDef {
  key: string;
  label: string;
  module: string;
  description?: string;
}

export default function RolesPage() {
  const { toast } = useToast();
  const { data: rolesData, loading, error, reload } = useApi<{ items: Role[] }>("/api/roles");
  const { data: catalogData } = useApi<{ modules: Record<string, PermissionDef[]> }>(
    "/api/permissions"
  );

  const [expanded, setExpanded] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    permissionIds: [] as string[],
  });
  const [creating, setCreating] = useState(false);

  const [deleting, setDeleting] = useState<Role | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openRole = (role: Role) => {
    setExpanded(role.id);
    setDraft([...role.permissions]);
  };

  const toggleDraft = (key: string) => {
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
  };

  const saveRole = async (role: Role) => {
    setSavingId(role.id);
    try {
      await api(`/api/roles/${role.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: role.name,
          description: role.description ?? "",
          permissionIds: draft.map((key) => keyToId(key)),
        }),
      });
      toast(`Permissions for "${role.name}" saved.`);
      setExpanded(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to save permissions.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const createRole = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api("/api/roles", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          permissionIds: createForm.permissionIds.map((key) => keyToId(key)),
        }),
      });
      toast(`Role "${createForm.name}" created.`);
      setCreateOpen(false);
      setCreateForm({ name: "", description: "", permissionIds: [] });
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to create role.", "error");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/roles/${deleting.id}`, { method: "DELETE" });
      toast("Role deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to delete role.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  // Map permission keys -> ids using the catalog (ids are stable 1..N seeded in order).
  function keyToId(key: string): number {
    let index = -1;
    for (const module of Object.values(catalogData?.modules ?? {})) {
      const found = module.findIndex((p) => p.key === key);
      if (found >= 0) {
        index += found + 1;
        return index + 1;
      }
      index += module.length;
    }
    return 0;
  }

  const allPermissionKeys = Object.values(catalogData?.modules ?? {}).flatMap((m) =>
    m.map((p) => p.key)
  );

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Granular permission control per role. System roles are protected."
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create Custom Role</Button>}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !rolesData || rolesData.items.length === 0 ? (
        <EmptyState icon="🔐" title="No roles yet" message="Roles are seeded on first run." />
      ) : (
        <div className="space-y-4">
          {rolesData.items.map((role) => {
            const open = expanded === role.id;
            const locked = role.id === 1;
            return (
              <Card key={role.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{role.name}</h3>
                      {role.is_system === 1 ? (
                        <Badge tone="violet">System</Badge>
                      ) : (
                        <Badge tone="cyan">Custom</Badge>
                      )}
                      <Badge tone="slate">{role.permissions.length} permissions</Badge>
                      <Badge tone="blue">{role.user_count} users</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{role.description}</p>
                  </div>
                  <div className="flex gap-2">
                    {locked ? (
                      <Badge tone="amber">🔒 Locked</Badge>
                    ) : (
                      <>
                        {!open && (
                          <Button size="sm" variant="secondary" onClick={() => openRole(role)}>
                            Manage permissions
                          </Button>
                        )}
                        {open && (
                          <Button size="sm" onClick={() => saveRole(role)} disabled={savingId === role.id}>
                            {savingId === role.id ? "Saving…" : "💾 Save changes"}
                          </Button>
                        )}
                        {role.is_system === 0 && (
                          <Button size="sm" variant="danger" onClick={() => setDeleting(role)}>
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setDraft([...allPermissionKeys])}>
                        Select all
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
                        Clear all
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(catalogData?.modules ?? {}).map(([module, perms]) => (
                        <div key={module} className="rounded-lg border border-slate-200 p-3">
                          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {module}
                          </div>
                          <div className="space-y-1">
                            {perms.map((p) => (
                              <label
                                key={p.key}
                                className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-teal-700"
                                  checked={draft.includes(p.key)}
                                  onChange={() => toggleDraft(p.key)}
                                />
                                <span className="font-medium">{p.label}</span>
                                <code className="ml-auto text-[10px] text-slate-400">{p.key}</code>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create custom role */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Custom Role"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" form="role-form" disabled={creating}>
              {creating ? "Creating…" : "Create role"}
            </Button>
          </>
        }
      >
        <form id="role-form" onSubmit={createRole} className="space-y-4">
          <Field label="Role name" required>
            <Input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Parts Manager"
              required
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </Field>
          <Field label="Permissions">
            <div className="grid max-h-72 grid-cols-1 gap-4 overflow-y-auto rounded-lg border border-slate-200 p-3 md:grid-cols-2">
              {Object.entries(catalogData?.modules ?? {}).map(([module, perms]) => (
                <div key={module}>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {module}
                  </div>
                  <div className="space-y-1">
                    {perms.map((p) => (
                      <label key={p.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-teal-700"
                          checked={createForm.permissionIds.includes(p.key)}
                          onChange={() =>
                            setCreateForm((f) => ({
                              ...f,
                              permissionIds: f.permissionIds.includes(p.key)
                                ? f.permissionIds.filter((k) => k !== p.key)
                                : [...f.permissionIds, p.key],
                            }))
                          }
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        title="Delete role?"
        message={
          <>
            Delete role <b>{deleting?.name}</b>? Roles that are assigned to users cannot be
            deleted.
          </>
        }
      />
    </div>
  );
}
