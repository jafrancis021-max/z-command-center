/**
 * job-handlers.ts — one handler per job_type
 *
 * Contract:
 *   - receives (db, config, log) — never throws; catch internally
 *   - returns JobResult: { ok, message, actions_taken, next_recommended_action }
 *   - no HTTP calls; call DB / existing lib functions directly
 *   - SHADOW MODE for any destructive action (no emails sent, no live exec)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobResult } from '@/types'
import { getActiveAccount, fetchRecentEmails } from '@/lib/gmail-client'
import { emitFeedEvent } from '@/lib/feed'
import { detectWorkflowIntent } from '@/lib/inbox-workflow-detector'
import { runOperationalMemoryConsolidation } from '@/lib/operational-memory-engine'
import { runNotificationGeneration } from '@/lib/notification-engine'

export type LogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, unknown>,
) => Promise<void>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (db: SupabaseClient<any>, config: Record<string, unknown>, log: LogFn) => Promise<JobResult>

// ── gmail_sync ────────────────────────────────────────────────────────────────

const gmailSync: Handler = async (db, _config, log) => {
  await log('info', 'Checking for connected Gmail account')

  const account = await getActiveAccount()
  if (!account) {
    await log('warn', 'No connected Gmail account — skipping sync')
    return {
      ok: true,
      message: 'No connected Gmail account',
      actions_taken: [],
      next_recommended_action: 'Connect a Gmail account at /inbox',
    }
  }

  await log('info', `Syncing emails for account: ${account.email_address}`, { account_id: account.id })

  const emails = await fetchRecentEmails(50)
  await log('info', `Fetched ${emails.length} emails from Gmail API`)

  let saved = 0
  const errs: string[] = []

  for (const email of emails) {
    const { error } = await db.from('emails').upsert({
      account_id:       account.id,
      gmail_id:         email.gmail_id,
      thread_id:        email.thread_id,
      subject:          email.subject,
      sender_email:     email.sender_email,
      sender_name:      email.sender_name,
      recipient_emails: email.recipient_emails,
      snippet:          email.snippet,
      body_text:        email.body_text,
      received_at:      email.received_at,
      is_read:          false,
    }, { onConflict: 'gmail_id', ignoreDuplicates: true })

    if (error) errs.push(error.message)
    else saved++
  }

  await db.from('email_accounts')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', account.id as string)

  await emitFeedEvent(db, {
    event_type: 'gmail_synced',
    title:      `Gmail synced — ${saved} emails`,
    severity:   'info',
    metadata:   { saved, total_fetched: emails.length, errors: errs.length },
  })

  await log('info', `Sync complete: ${saved} saved, ${errs.length} errors`)

  return {
    ok:                      errs.length === 0,
    message:                 `Synced ${saved} of ${emails.length} emails (${errs.length} errors)`,
    actions_taken:           [`gmail_sync: upserted ${saved} emails`],
    next_recommended_action: saved > 0 ? 'Run inbox_triage to classify new emails' : 'Nothing to do',
  }
}

// ── workflow detection helper ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runWorkflowDetection(db: SupabaseClient<any>, log: LogFn): Promise<number> {
  const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString()

  // Fetch recent emails and already-processed email IDs in parallel
  const [{ data: recentEmails }, { data: existing }] = await Promise.all([
    db
      .from('emails')
      .select('id, subject, body_text, snippet, sender_email, category')
      .gte('received_at', since48h)
      .neq('category', 'ignore')
      .order('received_at', { ascending: false })
      .limit(30),
    db
      .from('inbox_workflow_suggestions')
      .select('email_id')
      .gte('created_at', since48h),
  ])

  const processedIds = new Set((existing ?? []).map((r: { email_id: string }) => r.email_id))
  const toProcess    = (recentEmails ?? []).filter((e: { id: string }) => !processedIds.has(e.id))

  await log('info', `Workflow detection: ${toProcess.length} new email(s) to scan`)

  let suggested = 0

  for (const email of toProcess as Array<{
    id: string; subject: string | null; body_text: string | null
    snippet: string | null; sender_email: string | null; category: string
  }>) {
    const result = detectWorkflowIntent(email)

    // Skip noise: unknown type with very low confidence
    if (result.suggestion_type === 'unknown' && result.confidence < 0.2) continue

    const { error } = await db.from('inbox_workflow_suggestions').insert({
      email_id:          email.id,
      suggestion_type:   result.suggestion_type,
      title:             result.title,
      description:       result.description,
      confidence:        result.confidence,
      suggested_actions: result.suggested_actions,
      source:            'inbox_workflow_detector',
    })

    if (!error) {
      suggested++
    } else if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
      await log('warn', `Workflow suggestion insert failed for email ${email.id}: ${error.message}`)
    }
  }

  if (suggested > 0) {
    await emitFeedEvent(db, {
      event_type: 'workflow_suggestions_created',
      title:      `${suggested} workflow suggestion${suggested > 1 ? 's' : ''} created`,
      severity:   'info',
      metadata:   { count: suggested },
    })
  }

  return suggested
}

// ── inbox_triage ──────────────────────────────────────────────────────────────

const inboxTriage: Handler = async (db, _config, log) => {
  await log('info', 'Scanning for uncategorised emails')

  const { data: pending, error } = await db
    .from('emails')
    .select('id, subject, sender_email')
    .eq('category', 'uncategorized')
    .order('received_at', { ascending: false })
    .limit(1)

  if (error) {
    await log('error', `DB query failed: ${error.message}`)
    return {
      ok: false,
      message: error.message,
      actions_taken: [],
      next_recommended_action: 'Check Supabase connection',
    }
  }

  const count = pending?.length ?? 0
  await log('info', `${count} uncategorised email(s) found`)

  if (count > 0) {
    await emitFeedEvent(db, {
      event_type: 'inbox_triage_pending',
      title:      `${count} email(s) awaiting triage`,
      severity:   'warning',
      metadata:   { count },
    })
  }

  // Run workflow detection on recent emails not yet analysed
  const suggested = await runWorkflowDetection(db, log)

  const actionsTaken: string[] = []
  if (count > 0) actionsTaken.push(`detected ${count} uncategorised email(s)`)
  if (suggested > 0) actionsTaken.push(`workflow_detection: ${suggested} suggestion(s) created`)

  return {
    ok:                      true,
    message:                 [
      count > 0 ? `${count} emails need triage` : 'All emails are categorised',
      suggested > 0 ? `${suggested} workflow suggestion(s) created` : '',
    ].filter(Boolean).join(' | '),
    actions_taken:           actionsTaken,
    next_recommended_action: count > 0
      ? 'Visit /email-triage and run manual triage'
      : suggested > 0
        ? 'Review workflow suggestions at /inbox'
        : 'Nothing to do',
  }
}

// ── project_health_scan ───────────────────────────────────────────────────────

const projectHealthScan: Handler = async (db, _config, log) => {
  await log('info', 'Loading active projects')

  const { data: projects } = await db
    .from('projects')
    .select('id, name, status, risk_level')
    .eq('status', 'active')

  const projectList = projects ?? []
  await log('info', `Found ${projectList.length} active project(s)`)

  const actionsTaken: string[] = []
  let atRiskCount = 0

  for (const p of projectList) {
    const [{ count: openBlockers }, { count: stalledTasks }] = await Promise.all([
      db.from('blockers')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', p.id)
        .neq('status', 'resolved'),
      db.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', p.id)
        .eq('status', 'blocked'),
    ])

    const blockers = openBlockers ?? 0
    const stalled  = stalledTasks ?? 0

    await log('info', `${p.name}: ${blockers} open blockers, ${stalled} blocked tasks`)

    if (blockers > 0 || stalled > 0) {
      atRiskCount++
      actionsTaken.push(`${p.name}: ${blockers} blocker(s), ${stalled} blocked task(s)`)

      await emitFeedEvent(db, {
        event_type: 'project_health_warning',
        title:      `Health warning: ${p.name}`,
        description: `${blockers} open blocker(s), ${stalled} blocked task(s)`,
        severity:   blockers > 2 ? 'critical' : 'warning',
        metadata:   { project_id: p.id, open_blockers: blockers, blocked_tasks: stalled },
      })
    }
  }

  return {
    ok:                      true,
    message:                 `Scanned ${projectList.length} projects — ${atRiskCount} at risk`,
    actions_taken:           actionsTaken,
    next_recommended_action: atRiskCount > 0
      ? 'Review blockers on at-risk projects'
      : 'All projects healthy',
  }
}

// ── daily_operational_brief ───────────────────────────────────────────────────

const dailyOperationalBrief: Handler = async (db, _config, log) => {
  await log('info', 'Generating daily operational brief')

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const [{ count: newEmails }, { count: newApprovals }, { count: resolvedBlockers }, { count: completedTasks }] =
    await Promise.all([
      db.from('emails').select('id', { count: 'exact', head: true }).gte('received_at', since),
      db.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('blockers').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', since),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('updated_at', since),
    ])

  const summary = [
    `New emails: ${newEmails ?? 0}`,
    `Pending approvals: ${newApprovals ?? 0}`,
    `Blockers resolved today: ${resolvedBlockers ?? 0}`,
    `Tasks completed today: ${completedTasks ?? 0}`,
  ].join(' | ')

  await log('info', `Brief: ${summary}`)

  await emitFeedEvent(db, {
    event_type:  'daily_brief',
    title:       `Daily Brief — ${new Date().toLocaleDateString('en-GB')}`,
    description: summary,
    severity:    'info',
    metadata:    {
      new_emails:        newEmails ?? 0,
      pending_approvals: newApprovals ?? 0,
      resolved_blockers: resolvedBlockers ?? 0,
      completed_tasks:   completedTasks ?? 0,
    },
  })

  return {
    ok:                      true,
    message:                 summary,
    actions_taken:           ['emitted daily_brief feed event'],
    next_recommended_action: (newApprovals ?? 0) > 0 ? 'Review pending approvals at /approvals' : 'Nothing urgent',
  }
}

// ── weekly_report ─────────────────────────────────────────────────────────────

const weeklyReport: Handler = async (db, _config, log) => {
  await log('info', 'Generating weekly report')

  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()

  const [{ count: emails }, { count: tasks }, { count: decisions }, { count: blockers }] = await Promise.all([
    db.from('emails').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('updated_at', since),
    db.from('decisions').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('blockers').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', since),
  ])

  const week = `W${Math.ceil(new Date().getDate() / 7)}`
  const summary = `${week}: ${tasks ?? 0} tasks done, ${decisions ?? 0} decisions, ${blockers ?? 0} blockers resolved, ${emails ?? 0} emails received`

  await log('info', summary)

  await emitFeedEvent(db, {
    event_type:  'weekly_report',
    title:       `Weekly Report — ${new Date().toLocaleDateString('en-GB')}`,
    description: summary,
    severity:    'info',
    metadata:    { tasks_done: tasks ?? 0, decisions: decisions ?? 0, blockers_resolved: blockers ?? 0, emails: emails ?? 0 },
  })

  return {
    ok:                      true,
    message:                 summary,
    actions_taken:           ['emitted weekly_report feed event'],
    next_recommended_action: 'Review the weekly summary in the operational feed',
  }
}

// ── blocker_escalation ────────────────────────────────────────────────────────

const blockerEscalation: Handler = async (db, _config, log) => {
  await log('info', 'Checking for critical unresolved blockers')

  const threshold = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const { data: criticalBlockers } = await db
    .from('blockers')
    .select('id, title, project_id, severity, created_at')
    .neq('status', 'resolved')
    .in('severity', ['high', 'critical'])
    .lt('created_at', threshold)

  const list = criticalBlockers ?? []
  await log('info', `Found ${list.length} escalable blocker(s)`)

  const actions: string[] = []

  for (const b of list) {
    const ageHours = Math.round((Date.now() - new Date(b.created_at).getTime()) / 3_600_000)
    await emitFeedEvent(db, {
      event_type:  'blocker_escalation',
      title:       `Blocker escalated: ${b.title}`,
      description: `${b.severity.toUpperCase()} blocker unresolved for ${ageHours}h`,
      severity:    b.severity === 'critical' ? 'critical' : 'warning',
      source_table: 'blockers',
      source_id:   b.id,
      metadata:    { blocker_id: b.id, severity: b.severity, age_hours: ageHours },
    })
    actions.push(`Escalated: "${b.title}" (${ageHours}h old)`)
  }

  return {
    ok:                      true,
    message:                 list.length > 0 ? `Escalated ${list.length} blocker(s)` : 'No blockers to escalate',
    actions_taken:           actions,
    next_recommended_action: list.length > 0 ? 'Resolve blockers at the project page' : 'Nothing to escalate',
  }
}

// ── approval_followup ─────────────────────────────────────────────────────────

const approvalFollowup: Handler = async (db, _config, log) => {
  await log('info', 'Checking for stale pending approvals')

  const threshold = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const { data: stale } = await db
    .from('approvals')
    .select('id, title, approval_type, created_at')
    .eq('status', 'pending')
    .lt('created_at', threshold)

  const list = stale ?? []
  await log('info', `Found ${list.length} stale pending approval(s)`)

  if (list.length > 0) {
    await emitFeedEvent(db, {
      event_type:  'approval_followup',
      title:       `${list.length} pending approval(s) older than 24h`,
      description: list.slice(0, 3).map(a => a.title).join('; '),
      severity:    'warning',
      metadata:    { count: list.length, ids: list.map(a => a.id) },
    })
  }

  return {
    ok:                      true,
    message:                 list.length > 0 ? `${list.length} stale approval(s) surfaced` : 'No stale approvals',
    actions_taken:           list.length > 0 ? [`emitted follow-up for ${list.length} approval(s)`] : [],
    next_recommended_action: list.length > 0 ? 'Review approvals at /approvals' : 'Nothing to do',
  }
}

// ── memory_compaction ─────────────────────────────────────────────────────────

const memoryCompaction: Handler = async (db, _config, log) => {
  await log('info', 'Running operational memory consolidation')

  try {
    const result = await runOperationalMemoryConsolidation(db)

    const total = result.created + result.updated
    await log('info', `Consolidation complete: ${result.created} created, ${result.updated} updated`, {
      by_type: result.by_type,
    })

    if (total > 0) {
      await emitFeedEvent(db, {
        event_type:  'memory_consolidated',
        title:       `Operational memory updated — ${total} pattern${total > 1 ? 's' : ''}`,
        description: `${result.created} new, ${result.updated} updated`,
        severity:    'info',
        metadata:    { created: result.created, updated: result.updated, by_type: result.by_type },
      })
    }

    const actions = Object.entries(result.by_type)
      .filter(([, v]) => v.created + v.updated > 0)
      .map(([type, v]) => `${type}: +${v.created} new, ~${v.updated} updated`)

    return {
      ok:                      true,
      message:                 total > 0
        ? `Memory consolidated: ${result.created} created, ${result.updated} updated`
        : 'Memory consolidation ran — no new patterns detected',
      actions_taken:           actions,
      next_recommended_action: result.created > 0
        ? 'Review new operational memories at /memory'
        : 'Operational memory is up to date',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await log('error', `Memory consolidation failed: ${msg}`)
    return {
      ok:                      false,
      message:                 `Consolidation failed: ${msg}`,
      actions_taken:           [],
      next_recommended_action: 'Check DB connectivity and table existence',
    }
  }
}

// ── notification_scan ─────────────────────────────────────────────────────────

const notificationScan: Handler = async (db, _config, log) => {
  await log('info', 'Running notification generation scan')

  try {
    const result = await runNotificationGeneration(db)

    await log('info',
      `Scan complete: ${result.total_created} created, ${result.total_deduped} deduped`,
      { by_generator: result.by_generator },
    )

    const actions = Object.entries(result.by_generator)
      .filter(([, v]) => v.created > 0)
      .map(([gen, v]) => `${gen}: ${v.created} created`)

    return {
      ok:                      true,
      message:                 result.total_created > 0
        ? `${result.total_created} notification${result.total_created > 1 ? 's' : ''} created, ${result.total_deduped} deduped`
        : `No new notifications — ${result.total_deduped} conditions deduped`,
      actions_taken:           actions,
      next_recommended_action: result.total_created > 0
        ? 'Check notification center for new alerts'
        : 'All conditions within dedupe window — nothing new',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await log('error', `Notification scan failed: ${msg}`)
    return {
      ok:                      false,
      message:                 `Scan failed: ${msg}`,
      actions_taken:           [],
      next_recommended_action: 'Check DB connectivity',
    }
  }
}

// ── Handler registry ──────────────────────────────────────────────────────────

export const handlers: Record<string, Handler> = {
  gmail_sync:               gmailSync,
  inbox_triage:             inboxTriage,
  project_health_scan:      projectHealthScan,
  daily_operational_brief:  dailyOperationalBrief,
  weekly_report:            weeklyReport,
  blocker_escalation:       blockerEscalation,
  approval_followup:        approvalFollowup,
  memory_compaction:        memoryCompaction,
  notification_scan:        notificationScan,
}
