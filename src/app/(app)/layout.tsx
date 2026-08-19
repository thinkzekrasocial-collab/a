"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { AppShell, type SessionInfo } from "@/components/AppShell";

type MeResponse = { user: SessionInfo };

/** Validate the production session through the Cloudflare Worker API. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/api/auth/me")
      .then(({ user }) => {
        if (!cancelled) {
          setSession(user);
          setChecking(false);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 401) {
          router.replace("/login");
        }
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Checking session…
      </div>
    );
  }

  return <AppShell session={session}>{children}</AppShell>;
}
