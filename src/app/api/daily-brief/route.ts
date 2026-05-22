import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { generateInsights } from '@/lib/operational-insight-engine'
import { calculatePressure, type PressureScore } from '@/lib/operational-pressure'
import type {
  Approval, WorkflowRun, JobRun, ScheduledJob,
  BrowserExecutionRun, Notification, OperationalMemory,
  Blocker, InboxWorkflowSuggestion,
} from '@/types'
import type { EngineInsight } from '@/lib/operational-insight-engine'

export const dynamic = 'force-dynamic'

export interface DailyBriefData {
  generated_at: string
  pressure:     PressureScore
  execution: {
    browser_runs_today:  number
    browser_passed:      number
    browser_failed:      number
    workflow_runs_today: number
    workflow_passed:     number
    workflow_failed:     number
  }
  approvals: {
    pending:       number
    stale:         number
    oldest_hours:  number | null
    approved_today: number
    rejected_today: number
  }
  blockers: {
    open:     number
    critical: number
    high:     number
  }
  runtime: {
    status:         'healthy' | 'degraded' | 'error'
    stuck_jobs:     number
    failed_runs_24h: number
    active_jobs:    number
  }
  memories: {
    active:    number
    new_today: number
  }
  notifications: {
    unread:   number
    critical: number
  }
  insights: {
    total:       number
    critical:    number
    high:        number
    top_insight: { title: string; severity: string; area: string } | null
  }
  key_action: string | null
}

export async function GET() {
  const db          = getAdmin()
  const now         = new Date()
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const since24h    = new Date(now.getTime() - 86_400_000).toISOString()
  const since7d     = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const workspaceId = await getCurrentWorkspaceId()

  try {
    const [
      approvalsResult,
      workflowRunsResult,
      jobRunsResult,
      scheduledJobsResult,
      browserRunsResult,
      notificationsResult,
      memoriesResult,
      blockersResult,
      suggestionsResult,
    ] = await Promise.all([
      db.from('approvals').select('id, approval_type, title, description, project_id, status, payload, created_at, approved_at, rejection_note, entity_type, entity_id').order('created_at', { ascending: false }).limit(100),
      db.from('workflow_runs').select('id, workflow_template_id, project_id, status, error, started_at, completed_at, created_at').gte('created_at', since7d).order('created_at', { ascending: false }).limit(100),
      db.from('job_runs').select('id, scheduled_job_id, job_type, status, started_at, finished_at, duration_ms, error_message, created_at').gte('started_at', since24h).order('created_at', { ascending: false }).limit(100),
      db.from('scheduled_jobs').select('*').eq('status', 'active'),
      (() => {
        let q = db.from('browser_execution_runs').select('id, status, target_url, task_description, error_message, created_at, updated_at').order('created_at', { ascending: false }).limit(50)
        if (workspaceId) q = q.eq('workspace_id', workspaceId)
        return q
      })(),
      (() => {
        let q = db.from('notifications').select('id, type, severity, title, message, read, dismissed, metadata, created_at').eq('dismissed', false).order('created_at', { ascending: false }).limit(50)
        if (workspaceId) q = q.eq('workspace_id', workspaceId)
        return q
      })(),
      db.from('operational_memories').select('id, memory_type, title, summary, recurrence_count, first_seen_at, last_seen_at, status, created_at, updated_at').eq('status', 'active').order('last_seen_at', { ascending: false }).limit(100),
      db.from('blockers').select('id, project_id, title, severity, status, created_at').neq('status', 'resolved').order('created_at', { ascending: false }).limit(100),
      db.from('inbox_workflow_suggestions').select('id, status').eq('status', 'suggested').limit(50),
    ])

    const approvals        = (approvalsResult.data        ?? []) as Approval[]
    const workflowRuns     = (workflowRunsResult.data     ?? []) as WorkflowRun[]
    const jobRuns          = (jobRunsResult.data          ?? []) as JobRun[]
    const allJobs          = (scheduledJobsResult.data    ?? []) as ScheduledJob[]
    const browserRuns      = (browserRunsResult.data      ?? []) as BrowserExecutionRun[]
    const notifications    = (notificationsResult.data    ?? []) as Notification[]
    const memories         = (memoriesResult.data         ?? []) as OperationalMemory[]
    const blockers         = (blockersResult.data         ?? []) as Blocker[]
    const inboxSuggestions = (suggestionsResult.data      ?? []) as InboxWorkflowSuggestion[]

    // Stuck jobs
    const stuckJobs = allJobs.filter(j => {
      if (!j.last_run_at || j.next_run_at > now.toISOString()) return false
      const intervalMs = j.schedule_interval_minutes * 60_000
      return (now.getTime() - new Date(j.last_run_at).getTime()) > intervalMs * 2
    })

    // Insights
    const insights = generateInsights({
      approvals, workflowRuns, jobRuns, stuckJobs,
      browserRuns, notifications, memories, blockers, inboxSuggestions, now,
    })

    // Pressure
    const staleApprovals = approvals.filter(a => a.status === 'pending' && new Date(a.created_at) < new Date(now.getTime() - 86_400_000))
    const criticalNotifs = notifications.filter(n => n.severity === 'critical' && !n.read)
    const failedExec24h  = browserRuns.filter(r => r.status === 'failed' && new Date(r.created_at) >= new Date(since24h))
    const failedWF24h    = workflowRuns.filter(r => r.status === 'failed' && new Date(r.created_at) >= new Date(since24h))

    const pressure = calculatePressure({
      staleApprovals:        staleApprovals.length,
      pendingApprovals:      approvals.filter(a => a.status === 'pending').length,
      criticalBlockers:      blockers.filter(b => b.severity === 'critical').length,
      openBlockers:          blockers.length,
      failedWorkflows24h:    failedWF24h.length,
      stuckJobs:             stuckJobs.length,
      failedExecutions24h:   failedExec24h.length,
      criticalNotifications: criticalNotifs.length,
      inboxBacklog:          inboxSuggestions.length,
    })

    // Today's browser runs
    const browserToday  = browserRuns.filter(r => r.created_at >= todayStart)
    const wfToday       = workflowRuns.filter(r => r.created_at >= todayStart)

    // Approvals detail
    const pendingApprovals  = approvals.filter(a => a.status === 'pending')
    const oldestPending     = pendingApprovals.length > 0
      ? Math.round((now.getTime() - new Date(pendingApprovals.at(-1)!.created_at).getTime()) / 3_600_000)
      : null

    // Memories
    const memoriesNewToday = memories.filter(m => m.created_at >= todayStart)

    // Runtime status
    const failRate24h    = jobRuns.length > 0 ? jobRuns.filter(r => r.status === 'failed').length / jobRuns.length : 0
    const runtimeStatus: DailyBriefData['runtime']['status'] =
      failRate24h >= 0.5 || stuckJobs.length >= 3 ? 'error' :
      failRate24h >= 0.2 || stuckJobs.length >= 1 ? 'degraded' : 'healthy'

    // Key action derivation
    const topInsight: EngineInsight | null = insights[0] ?? null
    let key_action: string | null = null
    if (topInsight?.severity === 'critical') {
      key_action = topInsight.recommendation
    } else if (staleApprovals.length >= 3) {
      key_action = `Process ${staleApprovals.length} stale approvals blocking downstream automation`
    } else if (blockers.filter(b => b.severity === 'critical').length > 0) {
      key_action = `Resolve ${blockers.filter(b => b.severity === 'critical').length} critical blocker(s) to unblock project progress`
    } else if (stuckJobs.length > 0) {
      key_action = `Investigate ${stuckJobs.length} stuck scheduled job(s) to restore runtime health`
    }

    const brief: DailyBriefData = {
      generated_at: now.toISOString(),
      pressure,
      execution: {
        browser_runs_today:  browserToday.length,
        browser_passed:      browserToday.filter(r => r.status === 'completed').length,
        browser_failed:      browserToday.filter(r => r.status === 'failed').length,
        workflow_runs_today: wfToday.length,
        workflow_passed:     wfToday.filter(r => r.status === 'completed').length,
        workflow_failed:     wfToday.filter(r => r.status === 'failed').length,
      },
      approvals: {
        pending:        pendingApprovals.length,
        stale:          staleApprovals.length,
        oldest_hours:   oldestPending,
        approved_today: approvals.filter(a => a.approved_at && a.approved_at >= todayStart).length,
        rejected_today: approvals.filter(a => a.status === 'rejected' && a.created_at >= todayStart).length,
      },
      blockers: {
        open:     blockers.length,
        critical: blockers.filter(b => b.severity === 'critical').length,
        high:     blockers.filter(b => b.severity === 'high').length,
      },
      runtime: {
        status:          runtimeStatus,
        stuck_jobs:      stuckJobs.length,
        failed_runs_24h: jobRuns.filter(r => r.status === 'failed').length,
        active_jobs:     allJobs.length,
      },
      memories: {
        active:    memories.length,
        new_today: memoriesNewToday.length,
      },
      notifications: {
        unread:   notifications.filter(n => !n.read).length,
        critical: criticalNotifs.length,
      },
      insights: {
        total:       insights.length,
        critical:    insights.filter(i => i.severity === 'critical').length,
        high:        insights.filter(i => i.severity === 'high').length,
        top_insight: topInsight ? { title: topInsight.title, severity: topInsight.severity, area: topInsight.area } : null,
      },
      key_action,
    }

    return NextResponse.json(brief)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/daily-brief] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
