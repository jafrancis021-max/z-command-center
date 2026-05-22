import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { generateInsights } from '@/lib/operational-insight-engine'
import { calculatePressure } from '@/lib/operational-pressure'
import type {
  Approval, WorkflowRun, JobRun, ScheduledJob,
  BrowserExecutionRun, Notification, OperationalMemory,
  Blocker, InboxWorkflowSuggestion,
} from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db          = getAdmin()
  const now         = new Date()
  const since24h    = new Date(now.getTime() - 86_400_000).toISOString()
  const since7d     = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const workspaceId = await getCurrentWorkspaceId()

  try {
    // Parallel data fetch — all independent queries
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
      projectsResult,
    ] = await Promise.all([
      db.from('approvals').select('id, approval_type, title, description, project_id, status, payload, created_at, approved_at, rejection_note, entity_type, entity_id').order('created_at', { ascending: false }).limit(100),
      db.from('workflow_runs').select('id, workflow_template_id, project_id, status, error, started_at, completed_at, created_at').gte('created_at', since7d).order('created_at', { ascending: false }).limit(100),
      db.from('job_runs').select('id, scheduled_job_id, job_type, status, started_at, finished_at, duration_ms, error_message, created_at').gte('started_at', since24h).order('created_at', { ascending: false }).limit(100),
      db.from('scheduled_jobs').select('*').eq('status', 'active').order('name', { ascending: true }),
      (() => {
        let q = db.from('browser_execution_runs').select('id, status, target_url, task_description, error_message, created_at, updated_at').order('created_at', { ascending: false }).limit(30)
        if (workspaceId) q = q.eq('workspace_id', workspaceId)
        return q
      })(),
      (() => {
        let q = db.from('notifications').select('id, type, severity, title, message, read, dismissed, metadata, created_at').eq('dismissed', false).order('created_at', { ascending: false }).limit(50)
        if (workspaceId) q = q.eq('workspace_id', workspaceId)
        return q
      })(),
      db.from('operational_memories').select('*').eq('status', 'active').order('last_seen_at', { ascending: false }).limit(100),
      db.from('blockers').select('id, project_id, title, description, severity, status, resolved_at, created_at').neq('status', 'resolved').order('created_at', { ascending: false }).limit(100),
      db.from('inbox_workflow_suggestions').select('id, email_id, project_id, suggestion_type, title, description, confidence, status, suggested_actions, source, created_at, updated_at').eq('status', 'suggested').order('created_at', { ascending: false }).limit(50),
      db.from('projects').select('id, name, status, risk_level').order('name', { ascending: true }),
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
    const projects         = projectsResult.data ?? []

    // Detect stuck jobs
    const stuckJobs = allJobs.filter(j => {
      if (!j.last_run_at || j.next_run_at > now.toISOString()) return false
      const intervalMs       = j.schedule_interval_minutes * 60_000
      const timeSinceLastRun = now.getTime() - new Date(j.last_run_at).getTime()
      return timeSinceLastRun > intervalMs * 2
    })

    // Run insight engine
    const insights = generateInsights({
      approvals,
      workflowRuns,
      jobRuns,
      stuckJobs,
      browserRuns,
      notifications,
      memories,
      blockers,
      inboxSuggestions,
      now,
    })

    // Calculate pressure
    const staleApprovals = approvals.filter(a => a.status === 'pending' && new Date(a.created_at) < new Date(now.getTime() - 86_400_000))
    const criticalNotifs = notifications.filter(n => n.severity === 'critical' && !n.read)
    const failedExec24h  = browserRuns.filter(r => r.status === 'failed' && new Date(r.created_at) >= new Date(now.getTime() - 86_400_000))
    const failedWF24h    = workflowRuns.filter(r => r.status === 'failed' && new Date(r.created_at) >= new Date(now.getTime() - 86_400_000))

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

    // Per-project workspace intelligence
    const projectMap = Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name]))
    const workspaceInsights = projects.map((project: { id: string; name: string; status: string; risk_level: string | null }) => {
      const projectBlockers = blockers.filter(b => b.project_id === project.id)
      const projectWFRuns   = workflowRuns.filter(r => r.project_id === project.id)
      const failed          = projectWFRuns.filter(r => r.status === 'failed')
      const projectApprovals = approvals.filter(a => a.project_id === project.id && a.status === 'pending')

      const projectPressure = calculatePressure({
        staleApprovals:        projectApprovals.filter(a => new Date(a.created_at) < new Date(now.getTime() - 86_400_000)).length,
        pendingApprovals:      projectApprovals.length,
        criticalBlockers:      projectBlockers.filter(b => b.severity === 'critical').length,
        openBlockers:          projectBlockers.length,
        failedWorkflows24h:    failed.length,
        stuckJobs:             0,
        failedExecutions24h:   0,
        criticalNotifications: 0,
        inboxBacklog:          0,
      })

      return {
        project_id:    project.id,
        project_name:  project.name,
        status:        project.status,
        risk_level:    project.risk_level,
        pressure:      projectPressure,
        open_blockers: projectBlockers.length,
        pending_approvals: projectApprovals.length,
        workflow_failures: failed.length,
      }
    })

    return NextResponse.json({
      insights,
      pressure,
      workspace_insights: workspaceInsights,
      generated_at: now.toISOString(),
      summary: {
        total:    insights.length,
        critical: insights.filter(i => i.severity === 'critical').length,
        high:     insights.filter(i => i.severity === 'high').length,
        medium:   insights.filter(i => i.severity === 'medium').length,
        low:      insights.filter(i => i.severity === 'low').length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/insights] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
