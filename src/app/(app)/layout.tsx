import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { AppShell, type SessionInfo } from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Server-side auth gate: if the session cookie is missing/invalid or the
 * account is disabled, the user is redirected to /login. The UI shell only
 * renders menu items the user is actually permitted to see — and every API
 * endpoint re-checks the same permissions server-side.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await getSessionUser(token);

  if (!session) {
    redirect("/login");
  }

  const sessionInfo: SessionInfo = {
    id: session.id,
    name: session.name,
    username: session.username,
    roles: session.roles,
    permissions: session.permissions,
  };

  return <AppShell session={sessionInfo}>{children}</AppShell>;
}
