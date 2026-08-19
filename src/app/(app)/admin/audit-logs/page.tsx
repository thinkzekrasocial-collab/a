"use client";

import { useMemo, useState } from "react";
import { api, ApiClientError, fmtDateTime, queryString, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
} from "@/components/ui";
import { useToast } from "@/components/Toast";

interface AuditRow {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  module: string;
  record_id: string | null;
  description: string | null;
  metadata: string | null;
  ip: string | null;
  created_at: string;
}

function actionTone(action: string): "green" | "red" | "blue" | "amber" | "slate" | "cyan" | "violet" {
  if (action.includes("Login")) return "blue";
  if (action === "Logout") return "slate";
  if (action === "Create" || action === "User creation") return "green";
  if (action === "Update" || action === "Permission changes") return "cyan";
  if (action === "Delete" || action === "User disabled" || action === "Purge") return "red";
  if (action === "Stock IN") return "green";
  if (action === "Stock OUT") return "amber";
  if (action === "Export") return "violet";
  return "slate";
}

export default function AuditLogsPage() {
  const { toast } = useToast();
  const { data: me } = useApi<{ user: { roles: string[] } }>("/api/auth/me");
  const { data: usersData } = useApi<{ items: { id: number; name: string; username: string }[] }>(
    "/api/users?limit=100"
  );
  const [action, setAction] = useState("");
  const [module, setModule] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [purging, setPurging] = useState(false);

  const path = useMemo(
    () => `/api/audit-logs${queryString({ action, module, user_id: userId, page, limit: 20 })}`,
    [action, module, userId, page]
  );
  const { data, loading, error, reload } = useApi<{
    items: AuditRow[];
    total: number;
    page: number;
    limit: number;
    modules: string[];
  }>(path, [path]);

  const isSuper = (me?.user.roles ?? []).includes("Super Admin");

  const purge = async () => {
    setPurging(true);
    try {
      const res = await api<{ purged: number }>("/api/audit-logs?older_than_days=365", {
        method: "DELETE",
      });
      toast(`Purged ${res.purged} old audit entries.`, "info");
      reload();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Purge failed.", "error");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Official trail of logins, changes, stock movements and permission updates."
        actions={
          isSuper ? (
            <Button variant="danger" size="sm" onClick={purge} disabled={purging}>
              {purging ? "Purging…" : "🧹 Purge > 365 days"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <Field label="Action">
          <Input
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. Stock OUT"
          />
        </Field>
        <Field label="Module">
          <Select
            value={module}
            onChange={(e) => {
              setModule(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All modules</option>
            {(data?.modules ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="User">
          <Select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All users</option>
            {(usersData?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card
        title={
          <span>
            Events{" "}
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
          <EmptyState icon="📜" title="No audit events found" message="Events will be recorded as users work." />
        ) : (
          <>
            <Table headers={["When", "User", "Action", "Module", "Record", "Description"]}>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <Td className="text-slate-500">{fmtDateTime(a.created_at)}</Td>
                  <Td>{a.user_name ?? "System"}</Td>
                  <Td>
                    <Badge tone={actionTone(a.action)}>{a.action}</Badge>
                  </Td>
                  <Td>
                    <Badge tone="slate">{a.module}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-400">{a.record_id ?? "—"}</Td>
                  <Td className="max-w-[320px] truncate">{a.description ?? "—"}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Audit logs cannot be deleted by normal users — only the Super Admin can purge entries
        older than one year.
      </p>
    </div>
  );
}
