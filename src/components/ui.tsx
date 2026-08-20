"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect } from "react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#242424] text-white hover:bg-[#000] focus-visible:outline-[#242424] disabled:bg-[#aaa8a1]",
  secondary:
    "bg-white text-[#4b4944] border border-[#dedcd6] hover:bg-[#f3f2ee] focus-visible:outline-[#aaa8a1] disabled:text-[#aaa8a1]",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 disabled:bg-rose-300",
  ghost:
    "bg-transparent text-[#6b6963] hover:bg-[#efeee9] focus-visible:outline-[#aaa8a1] disabled:text-[#aaa8a1]",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-300",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        buttonStyles[variant],
        className
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type BadgeTone = "green" | "red" | "amber" | "blue" | "slate" | "cyan" | "violet";

const badgeStyles: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  red: "bg-rose-100 text-rose-800 ring-rose-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  blue: "bg-sky-100 text-sky-800 ring-sky-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  cyan: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  violet: "bg-violet-100 text-violet-800 ring-violet-200",
};

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function machineStatusTone(status: string): BadgeTone {
  switch (status) {
    case "Running":
      return "green";
    case "Idle":
      return "slate";
    case "Under Maintenance":
      return "amber";
    case "Breakdown":
      return "red";
    case "Inactive":
      return "violet";
    default:
      return "slate";
  }
}

export function txTypeTone(type: string): BadgeTone {
  if (type === "IN") return "green";
  if (type === "OUT") return "red";
  if (type === "OPENING") return "blue";
  return "slate";
}

export function stockTone(balance: number, minimum: number): BadgeTone {
  if (balance <= 0) return "red";
  if (balance < minimum) return "amber";
  return "green";
}

export function stockLabel(balance: number, minimum: number): string {
  if (balance <= 0) return "OUT OF STOCK";
  if (balance < minimum) return "LOW STOCK";
  return "IN STOCK";
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "teal",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: "teal" | "amber" | "rose" | "sky" | "violet" | "emerald" | "slate";
}) {
  const tones: Record<string, string> = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl", tones[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const controlCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlCls, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlCls, className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlCls, "min-h-[80px]", className)} {...props} />;
}

export function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal & confirm dialog
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={cn(
          "animate-fade-in-up relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

export function Table({
  headers,
  children,
  className,
}: {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("data-table thin-scroll -mx-5 overflow-x-auto px-5", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="bg-slate-50">
            {headers.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("whitespace-nowrap px-4 py-3 align-middle text-slate-700", className)}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function EmptyState({
  icon = "📭",
  title,
  message,
}: {
  icon?: string;
  title: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-1 text-sm font-semibold text-slate-700">{title}</p>
      {message && <p className="max-w-sm text-xs text-slate-500">{message}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span aria-hidden>⚠️</span>
      <span>{message}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm">
      <span className="text-xs text-slate-500">
        Page {page} of {pages} · {total.toLocaleString()} records
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← Prev
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next →
        </Button>
      </div>
    </div>
  );
}
