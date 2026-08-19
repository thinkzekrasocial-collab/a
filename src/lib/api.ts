"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tiny typed fetch wrapper used by all pages.
 * Every error returned by the Worker/API is surfaced as an ApiClientError
 * with the friendly server message ("Insufficient stock.", 403 messages, ...).
 */
export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // NEXT_PUBLIC_API_BASE lets this same UI talk to the deployed Cloudflare
  // Worker API instead of the local Next.js routes, e.g.
  //   NEXT_PUBLIC_API_BASE=https://ab-maintenance-bd-api.yourname.workers.dev
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    throw new ApiClientError(message, res.status);
  }
  return body as T;
}

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Formatting helpers shared across pages
// ---------------------------------------------------------------------------

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(String(value).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtNum(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "৳0";
  return `৳${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Data fetching hook
// ---------------------------------------------------------------------------

export function useApi<T>(
  path: string | null,
  deps: unknown[] = []
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof ApiClientError ? e.message : "Failed to load data.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  return { data, loading, error, reload };
}
