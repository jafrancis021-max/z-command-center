import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

export interface UnifiedTimelineEntry {
  id:           string
  source:       'feed' | 'notification' | 'approval' | 'workflow' | 'browser'
  title:        string
  description:  string | null
  severity:     string | null
  category:     string | null
  project_name: string | null
  project_id:   string | null
  status:       string | null
  created_at:   string
  metadata:     Record<string, unknown>
}

export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const source      = searchParams.get('source')
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '120', 10), 300)
  const workspaceId = await getCurrentWorkspaceId()

  const projectsResult = await db.from('projects').select('id, name')
  const projectMap: Record<string, string> = Object.fromEntries(
    (projectsResult.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
  )

  const entries: UnifiedTimelineEntry[] = []

  // ── Feed events ────────────────────────────────────────────────────────────
  if (!source || source === 'feed') {
    const { data } = await db
      .from('operational_feed_events')
      .select('id, project_id, event_type, title, description, severity, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(80)
    for (const row of (data ?? []) as Array<{
      id: string; project_id: string | null; event_type: string; title: string
      description: string | null; severity: string; metadata: Record<string, unknown>; created_at: string
    }>) {
      entries.push({
        id: `feed-${row.id}`,
        source: 'feed',
        title: row.title,
        description: row.description,
        severity: row.severity,
        category: row.event_type,
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id: row.project_id,
        status: null,
        created_at: row.created_at,
        metadata: row.metadata ?? {},
      })
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  if (!source || source === 'notification') {
    let q = db
      .from('notifications')
      .select('id, type, severity, title, message, read, metadata, created_at')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(80)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data } = await q
    for (const row of (data ?? []) as Array<{
      id: string; type: string; severity: string; title: string; message: string
      read: boolean; metadata: Record<string, unknown>; created_at: string
    }>) {
      entries.push({
        id: `notif-${row.id}`,
        source: 'notification',
        title: row.title,
        description: row.message,
        severity: row.severity,
        category: row.type,
        project_name: null,
        project_id: null,
        status: row.read ? 'read' : 'unread',
        created_at: row.created_at,
        metadata: row.metadata ?? {},
      })
    }
  }

  // ── Approvals ──────────────────────────────────────────────────────────────
  if (!source || source === 'approval') {
    const { data } = await db
      .from('approvals')
      .select('id, approval_type, title, description, project_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    for (const row of (data ?? []) as Array<{
      id: string; approval_type: string; title: string; description: string | null
      project_id: string | null; status: string; created_at: string
    }>) {
      const sev = row.status === 'rejected' ? 'critical'
                : row.status === 'pending'  ? 'warning'
                : 'info'
      entries.push({
        id: `approval-${row.id}`,
        source: 'approval',
        title: row.title,
        description: row.description,
        severity: sev,
        category: row.approval_type,
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id: row.project_id,
        status: row.status,
        created_at: row.created_at,
        metadata: {},
      })
    }
  }

  // ── Workflow runs ──────────────────────────────────────────────────────────
  if (!source || source === 'workflow') {
    const { data } = await db
      .from('workflow_runs')
      .select('id, project_id, status, error, created_at, workflow_template_id')
      .order('created_at', { ascending: false })
      .limit(50)
    for (const row of (data ?? []) as Array<{
      id: string; project_id: string | null; status: string; error: string | null
      workflow_template_id: string; created_at: string
    }>) {
      const sev = row.status === 'failed'    ? 'critical'
                : row.status === 'completed' ? 'success'
                : 'info'
      entries.push({
        id: `wf-${row.id}`,
        source: 'workflow',
        title: `Workflow Run`,
        description: row.error ?? null,
        severity: sev,
        category: 'workflow_run',
        project_name: row.project_id ? (projectMap[row.project_id] ?? null) : null,
        project_id: row.project_id,
        status: row.status,
        created_at: row.created_at,
        metadata: { template_id: row.workflow_template_id },
      })
    }
  }

  // ── Browser executions ─────────────────────────────────────────────────────
  if (!source || source === 'browser') {
    let q = db
      .from('browser_execution_runs')
      .select('id, status, target_url, task_description, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(40)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data } = await q
    for (const row of (data ?? []) as Array<{
      id: string; status: string; target_url: string; task_description: string
      error_message: string | null; created_at: string
    }>) {
      const sev = row.status === 'failed'    ? 'critical'
                : row.status === 'completed' ? 'success'
                : 'info'
      entries.push({
        id: `browser-${row.id}`,
        source: 'browser',
        title: row.task_description,
        description: row.error_message ?? row.target_url,
        severity: sev,
        category: 'browser_run',
        project_name: null,
        project_id: null,
        status: row.status,
        created_at: row.created_at,
        metadata: { target_url: row.target_url },
      })
    }
  }

  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return NextResponse.json(entries.slice(0, limit))
}
