import type {
  Approval, WorkflowRun, JobRun, ScheduledJob,
  BrowserExecutionRun, Notification, OperationalMemory,
  Blocker, InboxWorkflowSuggestion,
} from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightType =
  | 'approval_bottleneck'
  | 'recurring_workflow_failure'
  | 'stuck_job'
  | 'execution_failure_cluster'
  | 'critical_blocker_accumulation'
  | 'recurring_blocker_pattern'
  | 'inbox_backlog'
  | 'runtime_degradation'
  | 'memory_pattern_acceleration'
  | 'high_approval_pressure'

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low'
export type InsightArea     = 'approval' | 'workflow' | 'runtime' | 'execution' | 'blocker' | 'inbox' | 'memory' | 'general'

export interface EngineInsight {
  id:              string
  insight_type:    InsightType
  severity:        InsightSeverity
  confidence:      number
  title:           string
  description:     string
  why_it_matters:  string
  recommendation:  string
  source_ids:      string[]
  area:            InsightArea
  metadata:        Record<string, unknown>
}

export interface InsightEngineInput {
  approvals:        Approval[]
  workflowRuns:     WorkflowRun[]
  jobRuns:          JobRun[]
  stuckJobs:        ScheduledJob[]
  browserRuns:      BrowserExecutionRun[]
  notifications:    Notification[]
  memories:         OperationalMemory[]
  blockers:         Blocker[]
  inboxSuggestions: InboxWorkflowSuggestion[]
  now:              Date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function simpleHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

// ── Insight detectors ─────────────────────────────────────────────────────────

function detectApprovalBottleneck(
  approvals: Approval[],
  now: Date,
): EngineInsight | null {
  const since24h = new Date(now.getTime() - 86_400_000)
  const stale = approvals.filter(a => a.status === 'pending' && new Date(a.created_at) < since24h)
  if (stale.length < 2) return null

  const sev: InsightSeverity = stale.length >= 5 ? 'critical' : stale.length >= 3 ? 'high' : 'medium'
  return {
    id:             'approval_bottleneck',
    insight_type:   'approval_bottleneck',
    severity:       sev,
    confidence:     clamp(65 + stale.length * 5),
    title:          `Approval bottleneck: ${stale.length} item${stale.length > 1 ? 's' : ''} pending >24h`,
    description:    `${stale.length} approval${stale.length > 1 ? 's have' : ' has'} been waiting for more than 24 hours. Downstream automation relying on these approvals cannot proceed.`,
    why_it_matters: 'Approval queues older than 24h indicate operational friction. Blocked approvals halt downstream workflow chains.',
    recommendation: `Process the ${stale.length} stale approval${stale.length > 1 ? 's' : ''}. Consider setting up automatic reminders for approvals older than 12h.`,
    source_ids:     stale.map(a => a.id),
    area:           'approval',
    metadata:       { stale_count: stale.length, oldest_at: stale.at(-1)?.created_at },
  }
}

function detectRecurringWorkflowFailures(
  workflowRuns: WorkflowRun[],
  now: Date,
): EngineInsight[] {
  const since7d = new Date(now.getTime() - 7 * 86_400_000)
  const recentFailed = workflowRuns.filter(r => r.status === 'failed' && new Date(r.created_at) >= since7d)

  const byTemplate: Record<string, WorkflowRun[]> = {}
  for (const r of recentFailed) {
    const key = r.workflow_template_id ?? 'unknown'
    ;(byTemplate[key] ??= []).push(r)
  }

  return Object.entries(byTemplate)
    .filter(([, runs]) => runs.length >= 3)
    .map(([templateId, runs]) => {
      const count = runs.length
      const sev: InsightSeverity = count >= 6 ? 'critical' : count >= 4 ? 'high' : 'medium'
      return {
        id:             `recurring_workflow_failure_${simpleHash(templateId)}`,
        insight_type:   'recurring_workflow_failure' as InsightType,
        severity:       sev,
        confidence:     clamp(55 + count * 5),
        title:          `Recurring workflow failure: ${count}× in 7 days`,
        description:    `One workflow template has failed ${count} times in the last 7 days, indicating a systematic issue rather than a one-off error.`,
        why_it_matters: 'Repeated workflow failures waste resources and indicate unreliable automation. The underlying cause will continue causing failures.',
        recommendation: 'Inspect the failing workflow steps. Check if external dependencies changed. Review the error field in recent workflow_runs.',
        source_ids:     runs.map(r => r.id),
        area:           'workflow',
        metadata:       { template_id: templateId, failure_count: count },
      }
    })
}

function detectStuckJobs(stuckJobs: ScheduledJob[]): EngineInsight | null {
  if (stuckJobs.length === 0) return null
  return {
    id:             'stuck_job',
    insight_type:   'stuck_job',
    severity:       stuckJobs.length >= 3 ? 'critical' : 'high',
    confidence:     90,
    title:          `${stuckJobs.length} scheduled job${stuckJobs.length > 1 ? 's' : ''} appear stuck`,
    description:    `${stuckJobs.length} active job${stuckJobs.length > 1 ? 's are' : ' is'} overdue by more than 2× their scheduled interval and may be failing silently.`,
    why_it_matters: 'Stuck scheduled jobs mean data is not refreshing on schedule. Silent failures accumulate until noticed manually.',
    recommendation: 'Check the job runner health. Review recent job_runs logs for these jobs. Consider restarting the affected jobs.',
    source_ids:     stuckJobs.map(j => j.id),
    area:           'runtime',
    metadata:       { stuck_job_names: stuckJobs.map(j => j.name) },
  }
}

function detectExecutionFailureCluster(
  browserRuns: BrowserExecutionRun[],
): EngineInsight | null {
  const recent = browserRuns.slice(0, 20)
  if (recent.length < 5) return null

  const failed   = recent.filter(r => r.status === 'failed')
  const failRate = failed.length / recent.length
  if (failRate < 0.5) return null

  return {
    id:             'execution_failure_cluster',
    insight_type:   'execution_failure_cluster',
    severity:       failRate >= 0.8 ? 'critical' : 'high',
    confidence:     clamp(Math.round(failRate * 100)),
    title:          `Browser execution instability: ${Math.round(failRate * 100)}% failure rate`,
    description:    `${failed.length} of the last ${recent.length} browser executions failed. This is above the acceptable threshold and suggests systemic instability.`,
    why_it_matters: 'High execution failure rates indicate either external target instability or a local Playwright environment issue.',
    recommendation: 'Test with a simple known-good target (example.com). Check if the failure pattern is URL-specific or environment-wide.',
    source_ids:     failed.map(r => r.id),
    area:           'execution',
    metadata:       { fail_rate: failRate, sample_size: recent.length },
  }
}

function detectCriticalBlockers(blockers: Blocker[]): EngineInsight | null {
  const open     = blockers.filter(b => b.status !== 'resolved')
  const critical = open.filter(b => b.severity === 'critical')
  if (critical.length === 0) return null

  return {
    id:             'critical_blocker_accumulation',
    insight_type:   'critical_blocker_accumulation',
    severity:       critical.length >= 3 ? 'critical' : critical.length >= 2 ? 'high' : 'medium',
    confidence:     95,
    title:          `${critical.length} critical blocker${critical.length > 1 ? 's' : ''} unresolved`,
    description:    `${critical.length} critical and ${open.length - critical.length} other blockers are currently open. Critical blockers are the primary cause of project stall.`,
    why_it_matters: 'Each day a critical blocker remains open compounds risk. Unresolved critical blockers are the leading predictor of project failure.',
    recommendation: 'Schedule focused time today to address critical blockers. Each needs a clear owner and a concrete resolution path.',
    source_ids:     critical.map(b => b.id),
    area:           'blocker',
    metadata:       { critical_count: critical.length, total_open: open.length },
  }
}

function detectRecurringBlockerPattern(memories: OperationalMemory[]): EngineInsight | null {
  const candidates = memories
    .filter(m => m.memory_type === 'repeated_blocker' && m.recurrence_count >= 3 && m.status === 'active')
    .sort((a, b) => b.recurrence_count - a.recurrence_count)
  if (candidates.length === 0) return null

  const top = candidates[0]
  return {
    id:             `recurring_blocker_${simpleHash(top.key ?? top.id)}`,
    insight_type:   'recurring_blocker_pattern',
    severity:       top.recurrence_count >= 6 ? 'high' : 'medium',
    confidence:     clamp(45 + top.recurrence_count * 5),
    title:          `Recurring blocker: "${top.title}"`,
    description:    `This blocker pattern has occurred ${top.recurrence_count} times (first seen ${new Date(top.first_seen_at).toLocaleDateString()}). Recurring blockers signal a systemic unresolved issue.`,
    why_it_matters: 'Each recurrence of a blocker pattern wastes resolution time and indicates a root cause that has not been addressed.',
    recommendation: 'Investigate the root cause. Consider architectural changes that would prevent this class of blocker from appearing.',
    source_ids:     [top.id],
    area:           'blocker',
    metadata:       { recurrence_count: top.recurrence_count, key: top.key, first_seen: top.first_seen_at },
  }
}

function detectInboxBacklog(suggestions: InboxWorkflowSuggestion[]): EngineInsight | null {
  const pending = suggestions.filter(s => s.status === 'suggested')
  if (pending.length < 8) return null

  return {
    id:             'inbox_backlog',
    insight_type:   'inbox_backlog',
    severity:       pending.length >= 20 ? 'high' : 'medium',
    confidence:     85,
    title:          `Inbox backlog: ${pending.length} unprocessed suggestions`,
    description:    `${pending.length} inbox workflow suggestions are pending review. Inbox triage is falling behind and actionable items may be missed.`,
    why_it_matters: 'Unprocessed inbox suggestions mean potentially important actions are being delayed or lost.',
    recommendation: `Process the inbox backlog. Review the ${pending.length} pending suggestions and approve, reject, or dismiss each systematically.`,
    source_ids:     pending.map(s => s.id),
    area:           'inbox',
    metadata:       { pending_count: pending.length },
  }
}

function detectRuntimeDegradation(jobRuns: JobRun[], now: Date): EngineInsight | null {
  const since24h = new Date(now.getTime() - 86_400_000)
  const recent   = jobRuns.filter(r => new Date(r.started_at) >= since24h)
  if (recent.length < 5) return null

  const failed   = recent.filter(r => r.status === 'failed')
  const failRate = failed.length / recent.length
  if (failRate < 0.3) return null

  return {
    id:             'runtime_degradation',
    insight_type:   'runtime_degradation',
    severity:       failRate >= 0.6 ? 'critical' : failRate >= 0.4 ? 'high' : 'medium',
    confidence:     clamp(Math.round(failRate * 100)),
    title:          `Runtime degradation: ${Math.round(failRate * 100)}% job failure rate (24h)`,
    description:    `${failed.length} of ${recent.length} scheduled job runs in the last 24h have failed. Automation reliability is compromised.`,
    why_it_matters: 'High job failure rates mean scheduled operations are not completing. Data freshness and downstream automation are unreliable.',
    recommendation: 'Check infrastructure health. Review error messages in recent failed job_runs. Consider pausing non-critical jobs to stabilize.',
    source_ids:     failed.map(r => r.id),
    area:           'runtime',
    metadata:       { fail_rate: failRate, total_runs: recent.length, failed_count: failed.length },
  }
}

function detectMemoryPatternAcceleration(memories: OperationalMemory[], now: Date): EngineInsight | null {
  const accelerating = memories.filter(m => {
    if (m.status !== 'active' || m.recurrence_count < 4) return false
    const daysSinceFirst = (now.getTime() - new Date(m.first_seen_at).getTime()) / 86_400_000
    const daysSinceLast  = (now.getTime() - new Date(m.last_seen_at).getTime())  / 86_400_000
    return daysSinceLast < 7 && daysSinceFirst > 0 && m.recurrence_count / daysSinceFirst > 0.15
  }).sort((a, b) => b.recurrence_count - a.recurrence_count)

  if (accelerating.length === 0) return null
  const top = accelerating[0]

  return {
    id:             `memory_acceleration_${simpleHash(top.key ?? top.id)}`,
    insight_type:   'memory_pattern_acceleration',
    severity:       'medium',
    confidence:     65,
    title:          `Operational pattern accelerating: "${top.title}"`,
    description:    `This pattern has occurred ${top.recurrence_count} times and is recurring frequently. Last seen ${new Date(top.last_seen_at).toLocaleDateString()}. Without intervention, it will escalate.`,
    why_it_matters: 'Accelerating operational patterns indicate growing systemic issues that compound over time if not addressed proactively.',
    recommendation: 'Review the pattern evidence. Prioritize addressing the root cause before it reaches critical frequency.',
    source_ids:     [top.id],
    area:           'memory',
    metadata:       { recurrence_count: top.recurrence_count, memory_type: top.memory_type },
  }
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function generateInsights(input: InsightEngineInput): EngineInsight[] {
  const results: EngineInsight[] = []

  const push = (v: EngineInsight | null | EngineInsight[]) => {
    if (!v) return
    if (Array.isArray(v)) results.push(...v)
    else results.push(v)
  }

  push(detectApprovalBottleneck(input.approvals, input.now))
  push(detectRecurringWorkflowFailures(input.workflowRuns, input.now))
  push(detectStuckJobs(input.stuckJobs))
  push(detectExecutionFailureCluster(input.browserRuns))
  push(detectCriticalBlockers(input.blockers))
  push(detectRecurringBlockerPattern(input.memories))
  push(detectInboxBacklog(input.inboxSuggestions))
  push(detectRuntimeDegradation(input.jobRuns, input.now))
  push(detectMemoryPatternAcceleration(input.memories, input.now))

  // Sort: critical first, then by confidence desc
  const ORDER: Record<InsightSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  results.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.confidence - a.confidence)

  return results
}
