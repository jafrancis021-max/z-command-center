import { getAdmin } from './supabase-server'
import { getDefaultWorkspaceId } from './workspace-context'

export interface AuditLogEntry {
  action:       string
  target_type?: string
  target_id?:   string
  metadata?:    Record<string, unknown>
  workspace_id?: string | null
  actor_id?:    string | null
}

/**
 * Writes a row to audit_logs. Never throws — errors are swallowed
 * so audit failures never break the primary operation.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const workspace_id = entry.workspace_id !== undefined
      ? entry.workspace_id
      : await getDefaultWorkspaceId()

    await getAdmin().from('audit_logs').insert({
      workspace_id: workspace_id ?? null,
      actor_id:     entry.actor_id    ?? null,
      action:       entry.action,
      target_type:  entry.target_type ?? null,
      target_id:    entry.target_id   ?? null,
      metadata:     entry.metadata    ?? {},
    })
  } catch {
    console.error('[audit] Failed to write audit log — audit entry:', entry.action)
  }
}

/**
 * Convenience wrapper with positional args for the common case.
 */
export async function auditAction(
  action:      string,
  target_type?: string,
  target_id?:  string,
  metadata?:   Record<string, unknown>,
): Promise<void> {
  return writeAuditLog({ action, target_type, target_id, metadata })
}
