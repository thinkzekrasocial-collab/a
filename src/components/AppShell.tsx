"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/components/ui";
import { ToastProvider, useToast } from "@/components/Toast";

export interface SessionInfo {
  id: number;
  name: string;
  username: string;
  roles: string[];
  permissions: string[];
}

function has(perms: string[], p: string): boolean {
  return perms.includes(p);
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  perm?: string;
}

interface NavSection {
  title: string;
  perm?: string;
  items: NavItem[];
}

function buildSections(perms: string[]): NavSection[] {
  const sections: NavSection[] = [];
  const machine: NavItem[] = [];
  if (has(perms, "machine.view")) {
    machine.push({ href: "/machines/units", label: "Units", icon: "🏭" });
    machine.push({ href: "/machines/floors", label: "Floors", icon: "🏢" });
    machine.push({ href: "/machines/machine-types", label: "Machine Types", icon: "🏷️" });
    machine.push({ href: "/machines", label: "Machines", icon: "⚙️" });
  }
  if (machine.length) sections.push({ title: "Machines", items: machine });

  const parts: NavItem[] = [];
  if (has(perms, "part.view"))
    parts.push({ href: "/parts", label: "Parts List", icon: "🧩" });
  if (has(perms, "stock.in"))
    parts.push({ href: "/parts/stock-in", label: "Stock IN", icon: "📥" });
  if (has(perms, "stock.out"))
    parts.push({ href: "/parts/stock-out", label: "Stock OUT", icon: "📤" });
  if (has(perms, "transaction.view"))
    parts.push({ href: "/parts/transactions", label: "Transactions", icon: "📒" });
  if (parts.length) sections.push({ title: "Parts", items: parts });

  if (has(perms, "employee.view"))
    sections.push({ title: "Employees", items: [{ href: "/employees", label: "Employees", icon: "👷" }] });

  if (has(perms, "report.view"))
    sections.push({ title: "Reports", items: [{ href: "/reports", label: "Reports", icon: "📊" }] });

  const admin: NavItem[] = [];
  if (has(perms, "user.view"))
    admin.push({ href: "/admin/users", label: "Users", icon: "👤" });
  if (has(perms, "settings.manage"))
    admin.push({ href: "/admin/roles", label: "Roles & Permissions", icon: "🔐" });
  if (has(perms, "audit.view"))
    admin.push({ href: "/admin/audit-logs", label: "Audit Logs", icon: "📜" });
  if (admin.length) sections.push({ title: "Administration", items: admin });

  return sections;
}

export function BrandLogo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.7 19l-9.1-9.1c.8-2.3-.4-4.8-2.6-5.6C9.5 3.8 7.9 3.6 6.5 3.8c-.4.1-.6.6-.3.9l2.4 2.4-2.5 2.5L3.7 7.2c-.3-.3-.8-.1-.9.3-.2 1.4 0 3 .5 4.5.8 2.2 3.3 3.4 5.6 2.6l9.1 9.1c.4.4 1 .4 1.4 0l3.2-3.2c.4-.4.4-1.1.1-1.5z" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">AB Maintenance</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-400">Bangladesh · BD</div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  session,
  pathname,
  onNavigate,
}: {
  session: SessionInfo;
  pathname: string;
  onNavigate?: () => void;
}) {
  const sections = buildSections(session.permissions);
  const dashboardVisible =
    has(session.permissions, "machine.view") || has(session.permissions, "part.view");

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 thin-scroll">
      {dashboardVisible && (
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/dashboard"
              ? "bg-teal-600/20 text-teal-300"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          )}
        >
          <span className="text-base">📈</span> Dashboard
        </Link>
      )}

      {sections.map((section) => (
        <div key={section.title} className="mt-5">
          <div className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {section.title}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-teal-600/20 font-medium text-teal-300"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserChip({ session }: { session: SessionInfo }) {
  const initials = session.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
        {initials}
      </div>
      <div className="hidden leading-tight sm:block">
        <div className="text-sm font-semibold text-slate-800">{session.name}</div>
        <div className="text-[11px] text-slate-500">{session.roles.join(", ")}</div>
      </div>
    </div>
  );
}

function ShellInner({
  session,
  children,
}: {
  session: SessionInfo;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the request fails, clear the session client-side.
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 lg:flex">
        <div className="border-b border-slate-800 px-4 py-4">
          <BrandLogo />
        </div>
        <SidebarContent session={session} pathname={pathname} />
        <div className="border-t border-slate-800 p-3">
          <button
            onClick={logout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <span>🚪</span> {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              <BrandLogo />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <SidebarContent
              session={session}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
            <div className="border-t border-slate-800 p-3">
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <span>🚪</span> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="lg:hidden">
              <BrandLogo />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-400 md:block">
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <UserChip session={session} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>

        <footer className="px-6 pb-4 text-center text-[11px] text-slate-400">
          AB Maintenance BD · Machine &amp; Parts Inventory Management System
        </footer>
      </div>
    </div>
  );
}

export function AppShell({
  session,
  children,
}: {
  session: SessionInfo;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <ShellInner session={session}>{children}</ShellInner>
    </ToastProvider>
  );
}
