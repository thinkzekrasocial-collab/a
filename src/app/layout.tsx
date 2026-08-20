import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AB Maintenance BD — Machine & Parts Management",
  description:
    "Factory machine management, parts inventory with stock ledger, employees, reports and audit logs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#faf9f5] text-[#242424] antialiased">{children}</body>
    </html>
  );
}
