import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";

export interface AuditEntry {
  userId?: number | null;
  action: string;
  module: string;
  recordId?: string | number | null;
  description?: string | null;
  metadata?: unknown;
  ip?: string | null;
}

/**
 * Write an audit record. Audit failures must never break the main operation,
 * so errors are swallowed (and logged) rather than thrown.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      module: entry.module,
      recordId: entry.recordId != null ? String(entry.recordId) : null,
      description: entry.description ?? null,
      metadata: entry.metadata != null ? JSON.stringify(entry.metadata) : null,
      ip: entry.ip ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to write audit log:", error);
  }
}
