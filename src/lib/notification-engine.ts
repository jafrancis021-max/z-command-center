/**
 * notification-engine.ts
 * Deterministic operational notification generation.
 * No AI calls — pure DB condition checks with rolling-window deduplication.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifPayload {
  type:        string
  severity:    'info' | 'warning' | 'critical'
  title:       string
  message:     string
  source_type?: string
  source_id?:  string
  action_url?: string
  key?:        string
  metadata?:   Record<string, unknown>
}

interface NotifResult { created: number; deduped: number }

// ── Dedupe + emit ─────────────────────────────────────────────────────────────

/**
 * Inserts a notification only if no non-dismissed notification with the same
 * key was created within dedupeWindowHours. Returns 'created' or 'deduped'.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emitNotification(
  db: SupabaseClient<any>,
  payload: NotifPayload,
  dedupeWindowHours = 6,
): Promise<'created' | 'deduped'> {
  if (payload.key) {
    const windowStart = new Date(Date.now() - dedupeWindowHours * 3_600_000).toISOString()
    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('key', payload.key)
      .eq('dismissed', false)
      .gte('created_at', windowStart)
      .limit(1)

    if ((existing ?? []).length > 0) return 'deduped'
  }

  await db.from('notifications').insert({
    type:        payload.type,
    severity:    payload.severity,
    title:       payload.title,
    message:     payload.message,
    source_type: payload.source_type ?? null,
    source_id:   payload.source_id ?? null,
    action_url:  payload.action_url ?? null,
    key:         payload.key ?? null,
    metadata:    payload.metadata ?? {},
  })

  return 'created'
}

function tally(r: 'created' | 'deduped'): NotifResult {
  return r === 'created' ? { created: 1, deduped: 0 } : { created: 0, deduped: 1 }
}

function sum(...results: NotifResult[]): NotifResult {
  return results.reduce(
    (acc, r) => ({ created: acc.created + r.created, deduped: acc.deduped + r.deduped }),
    { created: 0, deduped: 0 },
  )
}

// ── Generators ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateRuntimeNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString()

  const { data } = await db
    .from('job_runs')
    .select('id, job_type, error_message, started_at')
    .eq('status', 'failed')
    .gte('started_at', since24h)

  const runs = (data ?? []) as Array<{ id: string; job_type: string; error_message: string | null }>
  if (runs.length === 0) return { created: 0, deduped: 0 }

  const r = await emitNotification(db, {
    type:       'runtime_failures',
    severity:   runs.length > 2 ? 'critical' : 'warning',
    title:      `${runs.length} job failure${runs.length > 1 ? 's' : ''} in the last 24h`,
    message:    `Failed: ${[...new Set(runs.map(r => r.job_type))].join(', ')}`,
    action_url: '/dashboard',
    key:        'runtime_failures_24h',
    metadata:   { failed_count: runs.length, job_types: runs.map(r => r.job_type) },
  }, 6)

  return tally(r)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateApprovalNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  const threshold = new Date(Date.now() - 24 * 3_600_000).toISOString()

  const { data } = await db
    .from('approvals')
    .select('id, title, approval_type, created_at')
    .eq('status', 'pending')
    .lt('created_at', threshold)

  const approvals = (data ?? []) as Array<{ id: string; title: string; approval_type: string; created_at: string }>
  if (approvals.length === 0) return { created: 0, deduped: 0 }

  // One notification per stale approval (deduped per approval for 12h)
  const results: NotifResult[] = await Promise.all(
    approvals.map(async a => {
      const ageH = Math.round((Date.now() - new Date(a.created_at).getTime()) / 3_600_000)
      const r = await emitNotification(db, {
        type:       'stale_approval',
        severity:   ageH > 48 ? 'critical' : 'warning',
        title:      `Approval waiting: ${a.title}`,
        message:    `"${a.title}" has been pending for ${ageH}h. Review and approve or reject.`,
        source_type: 'approvals',
        source_id:   a.id,
        action_url:  '/approvals',
        key:         `stale_approval:${a.id}`,
        metadata:    { approval_id: a.id, age_hours: ageH, approval_type: a.approval_type },
      }, 12)
      return tally(r)
    }),
  )

  return sum(...results)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateBlockerNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  const { data } = await db
    .from('blockers')
    .select('id, title, severity, project_id, created_at')
    .neq('status', 'resolved')
    .in('severity', ['critical', 'high'])

  const blockers = (data ?? []) as Array<{ id: string; title: string; severity: string; project_id: string | null; created_at: string }>
  if (blockers.length === 0) return { created: 0, deduped: 0 }

  const results: NotifResult[] = await Promise.all(
    blockers.map(async b => {
      const ageH = Math.round((Date.now() - new Date(b.created_at).getTime()) / 3_600_000)
      const r = await emitNotification(db, {
        type:        'critical_blocker',
        severity:    b.severity === 'critical' ? 'critical' : 'warning',
        title:       `${b.severity === 'critical' ? 'Critical' : 'High'} blocker: ${b.title}`,
        message:     `Unresolved for ${ageH}h. This is blocking operational progress.`,
        source_type: 'blockers',
        source_id:   b.id,
        action_url:  b.project_id ? `/projects/${b.project_id}` : '/dashboard',
        key:         `critical_blocker:${b.id}`,
        metadata:    { blocker_id: b.id, severity: b.severity, age_hours: ageH },
      }, 12)
      return tally(r)
    }),
  )

  return sum(...results)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateWorkflowNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  const { data } = await db
    .from('workflow_chain_runs')
    .select('id, workflow_chain_id, created_at, workflow_chains(name)')
    .eq('status', 'waiting_approval')
    .order('created_at', { ascending: true })

  const runs = (data ?? []) as unknown as Array<{
    id: string
    workflow_chain_id: string
    created_at: string
    workflow_chains: { name: string } | null
  }>
  if (runs.length === 0) return { created: 0, deduped: 0 }

  const results: NotifResult[] = await Promise.all(
    runs.map(async run => {
      const ageH  = Math.round((Date.now() - new Date(run.created_at).getTime()) / 3_600_000)
      const name  = run.workflow_chains?.name ?? run.workflow_chain_id
      const r = await emitNotification(db, {
        type:       'chain_waiting',
        severity:   ageH > 12 ? 'warning' : 'info',
        title:      `Chain waiting for approval: ${name}`,
        message:    `"${name}" chain has been waiting for approval for ${ageH}h.`,
        source_type: 'workflow_chain_runs',
        source_id:   run.id,
        action_url:  '/workflows#chain-runs',
        key:         `chain_waiting:${run.id}`,
        metadata:    { run_id: run.id, chain_id: run.workflow_chain_id, age_hours: ageH },
      }, 24)
      return tally(r)
    }),
  )

  return sum(...results)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateMemoryNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  // Surface high-recurrence patterns as operational insights
  const { data } = await db
    .from('operational_memories')
    .select('id, memory_type, title, recurrence_count, last_seen_at')
    .eq('status', 'active')
    .gte('recurrence_count', 5)
    .order('recurrence_count', { ascending: false })
    .limit(5)

  const memories = (data ?? []) as Array<{
    id: string; memory_type: string; title: string; recurrence_count: number; last_seen_at: string
  }>
  if (memories.length === 0) return { created: 0, deduped: 0 }

  const results: NotifResult[] = await Promise.all(
    memories.map(async m => {
      const r = await emitNotification(db, {
        type:        'memory_insight',
        severity:    m.recurrence_count >= 10 ? 'warning' : 'info',
        title:       `Pattern detected: ${m.title}`,
        message:     `This operational pattern has occurred ${m.recurrence_count} times. Consider automating or resolving it.`,
        source_type: 'operational_memories',
        source_id:   m.id,
        action_url:  '/memory',
        key:         `memory_insight:${m.id}`,
        metadata:    { memory_id: m.id, memory_type: m.memory_type, recurrence_count: m.recurrence_count },
      }, 24)
      return tally(r)
    }),
  )

  return sum(...results)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateInboxNotifications(db: SupabaseClient<any>): Promise<NotifResult> {
  const { count } = await db
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'uncategorized')

  const n = count ?? 0
  if (n < 5) return { created: 0, deduped: 0 }

  const r = await emitNotification(db, {
    type:       'inbox_backlog',
    severity:   n >= 20 ? 'critical' : 'warning',
    title:      `Inbox backlog: ${n} uncategorised email${n > 1 ? 's' : ''}`,
    message:    `${n} emails are uncategorised. Run inbox triage or visit the inbox to process them.`,
    action_url: '/inbox',
    key:        'inbox_backlog',
    metadata:   { uncategorised_count: n },
  }, 4)

  return tally(r)
}

// ── Main runner ───────────────────────────────────────────────────────────────

export interface NotificationRunResult {
  total_created: number
  total_deduped: number
  by_generator: Record<string, NotifResult>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runNotificationGeneration(db: SupabaseClient<any>): Promise<NotificationRunResult> {
  const [runtime, approvals, blockers, workflows, memory, inbox] = await Promise.all([
    generateRuntimeNotifications(db),
    generateApprovalNotifications(db),
    generateBlockerNotifications(db),
    generateWorkflowNotifications(db),
    generateMemoryNotifications(db),
    generateInboxNotifications(db),
  ])

  const all = [runtime, approvals, blockers, workflows, memory, inbox]
  const total_created = all.reduce((s, r) => s + r.created, 0)
  const total_deduped = all.reduce((s, r) => s + r.deduped, 0)

  return {
    total_created,
    total_deduped,
    by_generator: {
      runtime:   runtime,
      approvals: approvals,
      blockers:  blockers,
      workflows: workflows,
      memory:    memory,
      inbox:     inbox,
    },
  }
}
