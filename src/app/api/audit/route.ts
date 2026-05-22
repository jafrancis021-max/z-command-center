import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

export interface AuditEntry {
  id:           string
  source:       'audit' | 'approval' | 'workflow' | 'browser' | 'feed'
  severity:     'critical' | 'warning' | 'info' | 'success'
  title:        string
  description:  string | null
  category:     string | null
  status:       string | null
  actor:        string | null
  project_name: string | null
  project_id:   string | null
  created_at:   string
  metadata:     Record<string, unknown>
}

export async function GET(req: NextRequest) {
  const db               = getAdmin()
  const { searchParams } = new URL(req.url)
  const source           = searchParams.get('source')
  const severityFilter   = searchParams.get('severity')
  const limit            = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500)
  const workspaceId      = await getCurrentWorkspaceId()

  const { data: projRows } = await db.from('projects').select('id, name')
  const projectMap: Record<string, string> = Object.fromEntries(
    (projRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
  )

  const entries: AuditEntry[] = []

  // ── Audit logs ─────────────────────────────────────────────────────────────
  if (!source || source === 'audit') {
    let q = db
      .from('audit_logs')
      .select('id, workspace_id, actor_id, action, target_type, target_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data } = await q
    for (const row of (data ?? []) as Array<{
      id: string; actor_id: string | null; action: string; target_type: string | null
      target_id: string | null; metadata: Record<string, unknown>; created_at: string
    }>) {
      entries.push({
        id:           `audit-${row.id}`,
        source:       'audit',
        severity:     'info',
        title:        row.action,
        description:  row.target_type
          ? `${row.target_type}${row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ''}`
          : null,
        category:     row.target_type,
        status:       null,
        actor:        row.actor_id ?? null,
        project_name: null,
        project_id:   null,
        created_at:   row.created_at,
        metadata:     row.metadata ?? {},
      })
    }
  }

  // ── Approvals ──────────────────────────────────────────────────────────────
  if (!source || source === 'approval') {
    const { data } = await db
      .from('approvals')
      .select('id, approval_type, title, description, project_id, status, created_at, payload')
      .order('created_at', { ascending: false })
      .limit(100)
    for (const row of (data ?? []) as Array<{
      id: string; approval_type: string; title: string; description: string | null
      project_id: string | null; status: string; payload: Record<string, unknown> | null
      created_at: string
    }>) {
      const sev: AuditEntry['severity'] =
        row.status === 'rejected' ? 'critical' :
        row.status === 'pending'  ? 'warning'  :
        row.status === 'approved' ? 'success'  : 'info'
      entries.push({
        id:           `approval-${row.id}`,
        source:       'approval',
        severity:     sev,
        title:        row.title,
        description:  row.description,
        category:     row.approval_type,
        status:       row.status,
        actor:        null,
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id:   row.project_id,
        created_at:   row.created_at,
        metadata:     row.payload ?? {},
      })
    }
  }

  // ── Workflow runs ──────────────────────────────────────────────────────────
  if (!source || source === 'workflow') {
    const { data } = await db
      .from('workflow_runs')
      .select('id, project_id, status, error, created_at, workflow_template_id')
      .order('created_at', { ascending: false })
      .limit(100)
    for (const row of (data ?? []) as Array<{
      id: string; project_id: string | null; status: string; error: string | null
      workflow_template_id: string; created_at: string
    }>) {
      const sev: AuditEntry['severity'] =
        row.status === 'failed'    ? 'critical' :
        row.status === 'completed' ? 'success'  : 'info'
      entries.push({
        id:           `wf-${row.id}`,
        source:       'workflow',
        severity:     sev,
        title:        'Workflow Run',
        description:  row.error ?? null,
        category:     'workflow_run',
        status:       row.status,
        actor:        null,
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id:   row.project_id,
        created_at:   row.created_at,
        metadata:     { template_id: row.workflow_template_id },
      })
    }
  }

  // ── Browser executions ─────────────────────────────────────────────────────
  if (!source || source === 'browser') {
    let q = db
      .from('browser_execution_runs')
      .select('id, status, target_url, task_description, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(80)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data } = await q
    for (const row of (data ?? []) as Array<{
      id: string; status: string; target_url: string; task_description: string
      error_message: string | null; created_at: string
    }>) {
      const sev: AuditEntry['severity'] =
        row.status === 'failed'    ? 'critical' :
        row.status === 'completed' ? 'success'  : 'info'
      entries.push({
        id:           `browser-${row.id}`,
        source:       'browser',
        severity:     sev,
        title:        row.task_description,
        description:  row.error_message ?? row.target_url,
        category:     'browser_run',
        status:       row.status,
        actor:        null,
        project_name: null,
        project_id:   null,
        created_at:   row.created_at,
        metadata:     { target_url: row.target_url },
      })
    }
  }

  // ── Feed events (critical + warning only in audit context) ─────────────────
  if (!source || source === 'feed') {
    const { data } = await db
      .from('operational_feed_events')
      .select('id, project_id, event_type, title, description, severity, metadata, created_at')
      .in('severity', ['critical', 'warning'])
      .order('created_at', { ascending: false })
      .limit(60)
    for (const row of (data ?? []) as Array<{
      id: string; project_id: string | null; event_type: string; title: string
      description: string | null; severity: string; metadata: Record<string, unknown>; created_at: string
    }>) {
      const sev = (['critical', 'warning', 'info', 'success'] as const).includes(row.severity as AuditEntry['severity'])
        ? (row.severity as AuditEntry['severity'])
        : 'info'
      entries.push({
        id:           `feed-${row.id}`,
        source:       'feed',
        severity:     sev,
        title:        row.title,
        description:  row.description,
        category:     row.event_type,
        status:       null,
        actor:        null,
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id:   row.project_id,
        created_at:   row.created_at,
        metadata:     row.metadata ?? {},
      })
    }
  }

  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const filtered = severityFilter
    ? entries.filter(e => e.severity === severityFilter)
    : entries

  return NextResponse.json(filtered.slice(0, limit))
}
