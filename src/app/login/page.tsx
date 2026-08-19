"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { BrandLogo } from "@/components/AppShell";
import { Button, ErrorBox, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // If a valid session already exists, go straight to the dashboard.
  useEffect(() => {
    let cancelled = false;
    api("/api/auth/me")
      .then(() => {
        if (!cancelled) router.replace("/dashboard");
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Something went wrong. Please try again."
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Machine &amp; Parts Inventory Management System
          </p>

          {checking ? (
            <div className="mt-6 flex items-center justify-center py-6 text-sm text-slate-400">
              Checking session…
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {error && <ErrorBox message={error} />}
              <Field label="Username" required>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. superadmin"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}

        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} AB Maintenance BD
        </p>
      </div>
    </div>
  );
}
