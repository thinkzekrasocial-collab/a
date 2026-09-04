"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/api";
import { cn } from "@/components/ui";
import { ToastProvider, useToast } from "@/components/Toast";

export interface SessionInfo {
  id: number;
  name: string;
  username: string;
  roles: string[];
  permissions: string[];
}

interface WorkbookMenu {
  id: number;
  name: string;
  icon: string;
  entity_type: "employee" | "part";
  is_active: number;
}

export function BrandLogo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Globe Safety home">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#242424] text-[11px] font-semibold text-white shadow-sm">GS</div>
      {!compact && <div className="font-serif text-[17px] tracking-[-0.03em] text-[#202020]">Globe Safety</div>}
    </Link>
  );
}

function UserChip({ session }: { session: SessionInfo }) {
  const initials = session.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <div className="flex items-center gap-2 text-xs text-[#5f5d58]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#242424] text-[10px] font-semibold text-white">{initials}</span><span className="hidden sm:inline">{session.name}</span></div>;
}

function MobileNav({ session, menus, pathname, onNavigate }: { session: SessionInfo; menus: WorkbookMenu[]; pathname: string; onNavigate: () => void }) {
  const links = [["/parts", "Parts"], ["/parts/stock-in", "Stock IN"], ["/parts/stock-out", "Stock OUT"], ["/parts/transactions", "Transactions"], ["/machines", "Machines"], ["/machines/stock-in", "Machine IN"], ["/machines/stock-out", "Machine OUT / Sales"], ["/employees", "Employees"], ["/reports", "Reports"]];
  return <nav className="flex-1 space-y-1"><Link href="/dashboard" onClick={onNavigate} className={cn("block rounded-lg px-3 py-2 text-sm", pathname === "/dashboard" ? "bg-[#eceae4] font-medium" : "text-[#77756f]")}>Dashboard</Link>{menus[0] && <Link href={`/workbooks/${menus[0].id}`} onClick={onNavigate} className={cn("block rounded-lg px-3 py-2 text-sm", pathname.startsWith("/workbooks") ? "bg-[#eceae4] font-medium" : "text-[#77756f]")}>Excel Sheets</Link>}<Link href="/admin/users" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-sm text-[#77756f]">Admin</Link><div className="mt-5 border-t border-[#e7e5e0] pt-4"><div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aaa8a1]">Workspace</div>{links.map(([href, label]) => <Link key={href} href={href} onClick={onNavigate} className="block rounded-lg px-3 py-1.5 text-sm text-[#77756f] hover:bg-[#eceae4]">{label}</Link>)}</div><div className="mt-6 border-t border-[#e7e5e0] pt-4"><UserChip session={session} /></div></nav>;
}

function ShellInner({ session, children }: { session: SessionInfo; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: workbookData } = useApi<{ items: WorkbookMenu[] }>("/api/menus");
  const menus = (workbookData?.items ?? []).filter((menu) => menu.is_active === 1);
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try { await api("/api/auth/logout", { method: "POST" }); } catch { toast("Signed out locally."); }
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#242424]">
      <header className="border-b border-[#e7e5e0] bg-[#faf9f5]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <button onClick={() => setDrawerOpen(true)} className="rounded-full p-1.5 text-[#6b6a66] hover:bg-[#efeee9] lg:hidden" aria-label="Open menu"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg></button>
            <BrandLogo />
            <span className="hidden rounded-full border border-[#dedcd6] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#77756f] sm:inline-flex">Running balance fixed</span>
          </div>
          <div className="hidden w-full max-w-[380px] items-center gap-2 rounded-full border border-[#dedcd6] bg-[#f3f2ee] px-4 py-2 text-xs text-[#92908b] shadow-inner sm:flex"><svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8.5" cy="8.5" r="5.5" /><path strokeLinecap="round" d="m13 13 4 4" /></svg><span>Search parts, supplier, given to…</span></div>
        </div>
        <nav className="mx-auto flex max-w-[1400px] items-end gap-7 px-6 lg:px-8" aria-label="Primary navigation">
          <Link href="/dashboard" className={cn("border-b-2 px-0.5 pb-3 pt-1 text-xs transition-colors", pathname === "/dashboard" ? "border-[#222] font-medium text-[#222]" : "border-transparent text-[#92908b] hover:text-[#222]")}>Dashboard</Link>
          {menus[0] ? <Link href={`/workbooks/${menus[0].id}`} className={cn("border-b-2 px-0.5 pb-3 pt-1 text-xs transition-colors", pathname.startsWith("/workbooks") ? "border-[#222] font-medium text-[#222]" : "border-transparent text-[#92908b] hover:text-[#222]")}>Excel Sheets</Link> : <Link href="/parts" className="border-b-2 border-transparent px-0.5 pb-3 pt-1 text-xs text-[#92908b] hover:text-[#222]">Excel Sheets</Link>}
          <Link href="/admin/users" className="border-b-2 border-transparent px-0.5 pb-3 pt-1 text-xs text-[#92908b] hover:text-[#222]">Admin</Link>
          <div className="ml-auto hidden items-center gap-3 pb-2.5 sm:flex"><UserChip session={session} /><button onClick={logout} disabled={loggingOut} className="text-[11px] text-[#92908b] hover:text-[#222]">{loggingOut ? "Signing out…" : "Sign out"}</button></div>
        </nav>
      </header>

      {drawerOpen && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/20" onClick={() => setDrawerOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#faf9f5] p-5 shadow-xl"><div className="mb-5 flex items-center justify-between"><BrandLogo /><button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="text-2xl text-[#77756f]">×</button></div><MobileNav session={session} menus={menus} pathname={pathname} onNavigate={() => setDrawerOpen(false)} /><button onClick={logout} disabled={loggingOut} className="mt-4 border-t border-[#e7e5e0] pt-4 text-left text-sm text-[#77756f]">{loggingOut ? "Signing out…" : "Sign out"}</button></aside></div>}

      <main className="mx-auto min-h-[calc(100vh-112px)] max-w-[1400px] px-6 py-7 lg:px-8">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-6 pb-5 text-[11px] text-[#aaa8a1] lg:px-8">Globe Safety · Inventory workspace</footer>
    </div>
  );
}

export function AppShell({ session, children }: { session: SessionInfo; children: ReactNode }) {
  return <ToastProvider><ShellInner session={session}>{children}</ShellInner></ToastProvider>;
}
