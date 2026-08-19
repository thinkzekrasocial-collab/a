"use client";

import { useMemo, useState } from "react";
import { fmtDate, fmtNum, queryString, useApi } from "@/lib/api";
import {
  Badge,
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
  txTypeTone,
} from "@/components/ui";

interface Tx {
  id: number;
  part_id: number;
  transaction_type: string;
  quantity: number;
  transaction_date: string;
  source: string | null;
  destination: string | null;
  supplier: string | null;
  machine_id: number | null;
  reference_number: string | null;
  purpose: string | null;
  note: string | null;
  created_by: number;
  part_code: string;
  part_name: string;
  unit_of_measure: string;
  created_by_name: string;
  machine_code: string | null;
  balance_after: number;
}

export default function TransactionsPage() {
  const { data: partsData } = useApi<{ items: { id: number; part_name: string; part_code: string }[] }>(
    "/api/parts?limit=100"
  );
  const { data: usersData } = useApi<{ items: { id: number; name: string; username: string }[] }>(
    "/api/users?limit=100"
  );

  const [partId, setPartId] = useState("");
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const path = useMemo(
    () =>
      `/api/transactions${queryString({ part_id: partId, user_id: userId, type, from, to, page, limit: 15 })}`,
    [partId, userId, type, from, to, page]
  );
  const { data, loading, error } = useApi<{
    items: Tx[];
    total: number;
    page: number;
    limit: number;
  }>(path, [path]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Full stock ledger with running balance after every entry."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Part">
          <Select
            value={partId}
            onChange={(e) => {
              setPartId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All parts</option>
            {(partsData?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.part_name} ({p.part_code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">IN / OUT / OPENING</option>
            <option value="IN">IN only</option>
            <option value="OUT">OUT only</option>
            <option value="OPENING">OPENING only</option>
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
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>

      <Card
        title={
          <span>
            Ledger{" "}
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
          <EmptyState icon="📒" title="No transactions found" message="Try widening the filters." />
        ) : (
          <>
            <Table
              headers={[
                "Date",
                "Part",
                "Type",
                "Quantity",
                "Balance After",
                "User",
                "Ref",
                "Note",
              ]}
            >
              {data.items.map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.transaction_date)}</Td>
                  <Td>
                    <span className="font-medium text-slate-800">{t.part_name}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{t.part_code}</span>
                  </Td>
                  <Td>
                    <Badge tone={txTypeTone(t.transaction_type)}>{t.transaction_type}</Badge>
                  </Td>
                  <Td className="font-semibold">
                    {t.transaction_type === "OUT" ? "−" : "+"}
                    {fmtNum(t.quantity)} {t.unit_of_measure}
                  </Td>
                  <Td className="font-bold text-slate-900">
                    {fmtNum(t.balance_after)} {t.unit_of_measure}
                  </Td>
                  <Td className="text-slate-500">{t.created_by_name}</Td>
                  <Td>
                    {t.reference_number ? (
                      <Badge tone="slate">{t.reference_number}</Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="max-w-[180px] truncate">{t.note ?? "—"}</Td>
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
    </div>
  );
}
