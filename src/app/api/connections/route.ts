import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export interface ConnectionStatus {
  id:             string
  name:           string
  category:       'comms' | 'database' | 'execution' | 'intelligence' | 'storage' | 'automation'
  status:         'connected' | 'degraded' | 'disconnected' | 'placeholder'
  description:    string
  last_activity:  string | null
  activity_count: number
  health_note:    string | null
  warnings:       string[]
  action_href:    string | null
  future:         boolean
}

export async function GET() {
  const db      = getAdmin()
  const since24h = new Date(Date.now() - 86_400_000).toISOString()

  const [
    emailAccountsRes,
    browserRunsRes,
    scheduledJobsRes,
    memoriesRes,
    notificationsRes,
    intakeDocsRes,
    lastJobSuccessRes,
    feedEventsRes,
  ] = await Promise.allSettled([
    db.from('email_accounts').select('id, email, status, last_synced_at').limit(10),
    db.from('browser_execution_runs').select('id, status, created_at').order('created_at', { ascending: false }).limit(5),
    db.from('scheduled_jobs').select('id, name, status, last_run_at').eq('status', 'active'),
    db.from('operational_memories').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('dismissed', false),
    db.from('intake_documents').select('id, created_at, file_type, status').order('created_at', { ascending: false }).limit(5),
    db.from('job_runs').select('finished_at, status').eq('status', 'success').order('finished_at', { ascending: false }).limit(1),
    db.from('operational_feed_events').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
  ])

  type EmailRow = { id: string; email: string; status: string; last_synced_at: string | null }
  type BERow    = { id: string; status: string; created_at: string }
  type SJRow    = { id: string; name: string; status: string; last_run_at: string | null }
  type JRRow    = { finished_at: string | null; status: string }
  type IDRow    = { id: string; created_at: string; file_type: string; status: string }

  const emailAccounts  = emailAccountsRes.status === 'fulfilled' ? ((emailAccountsRes.value.data ?? []) as EmailRow[]) : []
  const browserRuns    = browserRunsRes.status === 'fulfilled' ? ((browserRunsRes.value.data ?? []) as BERow[]) : []
  const scheduledJobs  = scheduledJobsRes.status === 'fulfilled' ? ((scheduledJobsRes.value.data ?? []) as SJRow[]) : []
  const memoriesCount  = memoriesRes.status === 'fulfilled' ? (memoriesRes.value.count ?? 0) : 0
  const notifsCount    = notificationsRes.status === 'fulfilled' ? (notificationsRes.value.count ?? 0) : 0
  const intakeDocs     = intakeDocsRes.status === 'fulfilled' ? ((intakeDocsRes.value.data ?? []) as IDRow[]) : []
  const lastJobSuccess = lastJobSuccessRes.status === 'fulfilled' ? ((lastJobSuccessRes.value.data as JRRow[] | null)?.[0] ?? null) : null
  const feedCount      = feedEventsRes.status === 'fulfilled' ? (feedEventsRes.value.count ?? 0) : 0

  const activeEmails = emailAccounts.filter(e => e.status === 'active')
  const lastEmailSync = activeEmails.map(e => e.last_synced_at).filter(Boolean).sort().reverse()[0] ?? null

  const recentBrowserFailed = browserRuns.filter(r => r.status === 'failed').length
  const lastBrowserRun      = browserRuns[0] ?? null
  const lastBrowserWarning  = recentBrowserFailed > 0 ? `${recentBrowserFailed}/${browserRuns.length} recent run(s) failed` : null

  const lastJobAt = lastJobSuccess?.finished_at ?? null
  const jobAgeMs  = lastJobAt ? Date.now() - new Date(lastJobAt).getTime() : null
  const jobAgeHrs = jobAgeMs != null ? jobAgeMs / 3_600_000 : null

  const connections: ConnectionStatus[] = [
    // ── Gmail ──────────────────────────────────────────────────────────────────
    {
      id:             'gmail',
      name:           'Gmail',
      category:       'comms',
      status:         activeEmails.length > 0 ? 'connected' : emailAccounts.length > 0 ? 'degraded' : 'disconnected',
      description:    'Email ingestion and operational triage',
      last_activity:  lastEmailSync,
      activity_count: activeEmails.length,
      health_note:    activeEmails.length > 0 ? `${activeEmails.length} active account(s)` : 'No active accounts',
      warnings:       emailAccounts.filter(e => e.status !== 'active').length > 0 ? ['Some accounts inactive'] : [],
      action_href:    '/inbox',
      future:         false,
    },

    // ── Google Calendar ────────────────────────────────────────────────────────
    {
      id:             'google_calendar',
      name:           'Google Calendar',
      category:       'comms',
      status:         'placeholder',
      description:    'Deadline tracking and operational scheduling',
      last_activity:  null,
      activity_count: 0,
      health_note:    'Not yet configured',
      warnings:       [],
      action_href:    null,
      future:         false,
    },

    // ── Supabase ───────────────────────────────────────────────────────────────
    {
      id:             'supabase',
      name:           'Supabase',
      category:       'database',
      status:         'connected',
      description:    'Primary operational database and storage',
      last_activity:  lastJobAt,
      activity_count: scheduledJobs.length,
      health_note:    `${scheduledJobs.length} scheduled job(s) active`,
      warnings:       [],
      action_href:    '/system-proof',
      future:         false,
    },

    // ── Playwright Runtime ─────────────────────────────────────────────────────
    {
      id:             'playwright',
      name:           'Playwright Runtime',
      category:       'execution',
      status:         recentBrowserFailed >= 3 ? 'degraded' : browserRuns.length > 0 ? 'connected' : 'disconnected',
      description:    'Browser execution sandbox for automated tasks',
      last_activity:  lastBrowserRun?.created_at ?? null,
      activity_count: browserRuns.length,
      health_note:    lastBrowserRun ? `Last run: ${lastBrowserRun.status}` : 'No runs yet',
      warnings:       lastBrowserWarning ? [lastBrowserWarning] : [],
      action_href:    '/browser-execution',
      future:         false,
    },

    // ── Document Intake ────────────────────────────────────────────────────────
    {
      id:             'document_intake',
      name:           'Document Intake',
      category:       'storage',
      status:         'connected',
      description:    'PDF, DOCX, CSV and note ingestion pipeline',
      last_activity:  intakeDocs[0]?.created_at ?? null,
      activity_count: intakeDocs.length,
      health_note:    intakeDocs.length > 0 ? `${intakeDocs.length} recent item(s)` : 'No documents yet',
      warnings:       intakeDocs.filter(d => d.status === 'failed').length > 0 ? ['Some documents failed processing'] : [],
      action_href:    '/intake',
      future:         false,
    },

    // ── Operational Memory ─────────────────────────────────────────────────────
    {
      id:             'operational_memory',
      name:           'Operational Memory',
      category:       'intelligence',
      status:         memoriesCount > 0 ? 'connected' : 'disconnected',
      description:    'Pattern tracking and operational knowledge base',
      last_activity:  null,
      activity_count: memoriesCount,
      health_note:    `${memoriesCount} active memory(ies)`,
      warnings:       [],
      action_href:    '/memory',
      future:         false,
    },

    // ── Notifications ──────────────────────────────────────────────────────────
    {
      id:             'notifications',
      name:           'Notifications',
      category:       'automation',
      status:         'connected',
      description:    'System alerts, escalations and operational events',
      last_activity:  null,
      activity_count: notifsCount,
      health_note:    `${notifsCount} active notification(s)`,
      warnings:       [],
      action_href:    '/dashboard',
      future:         false,
    },

    // ── Workflow Engine ────────────────────────────────────────────────────────
    {
      id:             'workflow_engine',
      name:           'Workflow Engine',
      category:       'automation',
      status:         scheduledJobs.length > 0 ? (jobAgeHrs != null && jobAgeHrs > 24 ? 'degraded' : 'connected') : 'disconnected',
      description:    'Scheduled automation and operational orchestration',
      last_activity:  lastJobAt,
      activity_count: scheduledJobs.length,
      health_note:    lastJobAt ? `Last success: ${new Date(lastJobAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No successful runs',
      warnings:       jobAgeHrs != null && jobAgeHrs > 24 ? [`No successful run in ${Math.round(jobAgeHrs)}h`] : [],
      action_href:    '/workflows',
      future:         false,
    },
  ]

  // ── Placeholder future integrations ────────────────────────────────────────
  const future: ConnectionStatus[] = [
    { id: 'google_drive', name: 'Google Drive',    category: 'storage',    status: 'placeholder', description: 'Document storage and case attachments', last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
    { id: 'outlook',      name: 'Outlook',          category: 'comms',      status: 'placeholder', description: 'Microsoft email integration',           last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
    { id: 'slack',        name: 'Slack',             category: 'comms',      status: 'placeholder', description: 'Team notifications and escalations',    last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
    { id: 'crm',          name: 'CRM',               category: 'database',   status: 'placeholder', description: 'Client and contact management',         last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
    { id: 'whatsapp',     name: 'WhatsApp',           category: 'comms',      status: 'placeholder', description: 'Client messaging channel',             last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
    { id: 'insurer',      name: 'Insurer Portals',    category: 'execution',  status: 'placeholder', description: 'Direct claim and policy system access', last_activity: null, activity_count: 0, health_note: 'Planned', warnings: [], action_href: null, future: true },
  ]

  return NextResponse.json({
    connections: [...connections, ...future],
    generated_at: new Date().toISOString(),
    summary: {
      connected:    connections.filter(c => c.status === 'connected').length,
      degraded:     connections.filter(c => c.status === 'degraded').length,
      disconnected: connections.filter(c => c.status === 'disconnected').length,
      placeholder:  [...connections, ...future].filter(c => c.status === 'placeholder').length,
    },
  })
}
