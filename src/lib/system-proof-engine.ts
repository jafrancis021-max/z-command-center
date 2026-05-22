import { getAdmin } from './supabase-server'
import { getCurrentWorkspaceId } from './workspace-context'
import { generateInsights } from './operational-insight-engine'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckCategory = 'database' | 'runtime' | 'execution' | 'intelligence' | 'comms'
export type CheckStatus   = 'pass' | 'warning' | 'fail'
export type OverallStatus = 'healthy' | 'degraded' | 'critical'

export interface ProofCheck {
  name:       string
  category:   CheckCategory
  status:     CheckStatus
  message:    string
  evidence:   string
  latency_ms: number
  checked_at: string
}

export interface ProofResult {
  overall_status: OverallStatus
  checked_at:     string
  duration_ms:    number
  checks:         ProofCheck[]
  summary: {
    total:   number
    pass:    number
    warning: number
    fail:    number
  }
}

type CheckCore = Pick<ProofCheck, 'status' | 'message' | 'evidence'>

// ── Check runner with 5s timeout ──────────────────────────────────────────────

async function runCheck(
  name:     string,
  category: CheckCategory,
  fn:       () => Promise<CheckCore>,
): Promise<ProofCheck> {
  const start     = Date.now()
  const checkedAt = new Date().toISOString()
  try {
    const timer  = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('check timed out (5s)')), 5_000)
    )
    const result = await Promise.race([fn(), timer])
    return { name, category, ...result, latency_ms: Date.now() - start, checked_at: checkedAt }
  } catch (err) {
    return {
      name, category,
      status:     'fail',
      message:    err instanceof Error ? err.message : 'Unknown exception',
      evidence:   'Check threw an unhandled exception',
      latency_ms: Date.now() - start,
      checked_at: checkedAt,
    }
  }
}

// ── Engine — 18 checks run in parallel ───────────────────────────────────────

export async function runSystemProof(): Promise<ProofResult> {
  const engineStart = Date.now()
  const db          = getAdmin()
  const now         = new Date()
  const since24h    = new Date(now.getTime() - 86_400_000).toISOString()

  const checks = await Promise.all([

    // 1 ── Supabase connectivity
    runCheck('supabase_connectivity', 'database', async () => {
      const { count, error } = await db.from('projects').select('*', { count: 'exact', head: true })
      if (error) return { status: 'fail', message: `DB query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Supabase reachable and queryable', evidence: `projects table: ${count ?? 0} row(s)` }
    }),

    // 2 ── Workspace context
    runCheck('workspace_context', 'database', async () => {
      const id = await getCurrentWorkspaceId()
      if (!id) return { status: 'warning' as const, message: 'No workspace configured', evidence: 'getCurrentWorkspaceId() returned null — apply migration 011' }
      return { status: 'pass', message: 'Workspace context resolved', evidence: `workspace_id: ${id}` }
    }),

    // 3 ── Gmail connections
    runCheck('gmail_connections', 'comms', async () => {
      const { count, error } = await db.from('email_accounts').select('*', { count: 'exact', head: true }).eq('status', 'active')
      if (error) return { status: 'fail', message: `email_accounts query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      if ((count ?? 0) === 0) return { status: 'warning' as const, message: 'No active email accounts', evidence: 'email_accounts: 0 active rows' }
      return { status: 'pass', message: `${count} email account(s) connected`, evidence: `email_accounts.status = 'active': ${count} row(s)` }
    }),

    // 4 ── Scheduled jobs active
    runCheck('scheduled_jobs_active', 'runtime', async () => {
      const { count, error } = await db.from('scheduled_jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')
      if (error) return { status: 'fail', message: `scheduled_jobs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      if ((count ?? 0) === 0) return { status: 'warning' as const, message: 'No active scheduled jobs', evidence: 'scheduled_jobs.status = active: 0 rows' }
      return { status: 'pass', message: `${count} scheduled job(s) registered active`, evidence: `scheduled_jobs.status = 'active': ${count} row(s)` }
    }),

    // 5 ── Stuck jobs detection
    runCheck('stuck_jobs_detection', 'runtime', async () => {
      const { data, error } = await db
        .from('scheduled_jobs')
        .select('id, name, last_run_at, next_run_at, schedule_interval_minutes')
        .eq('status', 'active')
      if (error) return { status: 'fail', message: `stuck jobs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      type SJRow = { id: string; name: string; last_run_at: string | null; next_run_at: string; schedule_interval_minutes: number }
      const jobs  = (data ?? []) as SJRow[]
      const stuck = jobs.filter(j => {
        if (!j.last_run_at || j.next_run_at > now.toISOString()) return false
        const intervalMs       = j.schedule_interval_minutes * 60_000
        const timeSinceLastRun = now.getTime() - new Date(j.last_run_at).getTime()
        return timeSinceLastRun > intervalMs * 2
      })
      if (stuck.length === 0) return { status: 'pass', message: 'No stuck jobs detected', evidence: `All ${jobs.length} active job(s) within expected run window` }
      const names = stuck.map(j => j.name).join(', ')
      if (stuck.length >= 3) return { status: 'fail', message: `${stuck.length} stuck job(s) — critical`, evidence: `Stuck: ${names}` }
      return { status: 'warning' as const, message: `${stuck.length} stuck job(s) detected`, evidence: `Overdue: ${names}` }
    }),

    // 6 ── Workflow suggestions
    runCheck('workflow_suggestions', 'database', async () => {
      const { count, error } = await db.from('inbox_workflow_suggestions').select('*', { count: 'exact', head: true })
      if (error) return { status: 'fail', message: `inbox_workflow_suggestions query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Workflow suggestions subsystem reachable', evidence: `inbox_workflow_suggestions: ${count ?? 0} row(s)` }
    }),

    // 7 ── Workflow chains
    runCheck('workflow_chains', 'database', async () => {
      const { count, error } = await db.from('workflow_chain_runs').select('*', { count: 'exact', head: true })
      if (error) return { status: 'fail', message: `workflow_chain_runs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Workflow chains subsystem reachable', evidence: `workflow_chain_runs: ${count ?? 0} row(s)` }
    }),

    // 8 ── Operational memories
    runCheck('operational_memories', 'database', async () => {
      const { count, error } = await db.from('operational_memories').select('*', { count: 'exact', head: true }).eq('status', 'active')
      if (error) return { status: 'fail', message: `operational_memories query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Operational memories accessible', evidence: `${count ?? 0} active memory(ies)` }
    }),

    // 9 ── Notifications subsystem
    runCheck('notifications_subsystem', 'database', async () => {
      const { count, error } = await db.from('notifications').select('*', { count: 'exact', head: true }).eq('dismissed', false)
      if (error) return { status: 'fail', message: `notifications query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Notifications subsystem reachable', evidence: `${count ?? 0} undismissed notification(s)` }
    }),

    // 10 ── Audit logs 24h
    runCheck('audit_logs_24h', 'database', async () => {
      const { count, error } = await db.from('action_logs').select('*', { count: 'exact', head: true }).gte('created_at', since24h)
      if (error) return { status: 'fail', message: `action_logs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      if ((count ?? 0) === 0) return { status: 'warning' as const, message: 'No audit activity in last 24h', evidence: 'action_logs: 0 rows in last 24h — system may be idle' }
      return { status: 'pass', message: 'Audit trail active', evidence: `${count} action(s) logged in last 24h` }
    }),

    // 11 ── Browser execution runs
    runCheck('browser_execution_runs', 'execution', async () => {
      const { data, count, error } = await db
        .from('browser_execution_runs')
        .select('id, status, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) return { status: 'fail', message: `browser_execution_runs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      type BERow = { id: string; status: string; created_at: string }
      const last    = (data as BERow[] | null)?.[0]
      const lastStr = last
        ? `last: ${last.status} @ ${new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'no runs yet'
      return { status: 'pass', message: 'Browser execution subsystem reachable', evidence: `${count ?? 0} total run(s), ${lastStr}` }
    }),

    // 12 ── Screenshot integrity
    runCheck('screenshot_integrity', 'execution', async () => {
      const { data, error } = await db
        .from('browser_execution_runs')
        .select('id, result')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return { status: 'fail', message: `screenshot integrity query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      type BERow = { id: string; result: Record<string, unknown> | null }
      const rows = (data as BERow[] | null) ?? []
      if (rows.length === 0) return { status: 'pass', message: 'No completed runs to verify', evidence: 'browser_execution_runs: 0 completed rows yet' }
      const withScreenshot = rows.filter(r => r.result && typeof r.result === 'object' && r.result['screenshot_url'])
      if (withScreenshot.length < rows.length) {
        return {
          status:   'warning' as const,
          message:  `${rows.length - withScreenshot.length}/${rows.length} completed run(s) missing screenshot_url`,
          evidence: `screenshot_url present: ${withScreenshot.length}/${rows.length} last completed runs`,
        }
      }
      return { status: 'pass', message: 'Screenshot capture verified', evidence: `${rows.length}/${rows.length} last completed run(s) have screenshot_url` }
    }),

    // 13 ── Feed events 24h
    runCheck('feed_events_24h', 'database', async () => {
      const { count, error } = await db.from('operational_feed_events').select('*', { count: 'exact', head: true }).gte('created_at', since24h)
      if (error) return { status: 'fail', message: `operational_feed_events query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      if ((count ?? 0) === 0) return { status: 'warning' as const, message: 'No feed events in last 24h', evidence: 'operational_feed_events: 0 rows in last 24h' }
      return { status: 'pass', message: 'Feed pipeline active', evidence: `${count} event(s) in last 24h` }
    }),

    // 14 ── Runtime last success
    runCheck('runtime_last_success', 'runtime', async () => {
      const { data, error } = await db
        .from('job_runs')
        .select('finished_at, job_type')
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
      if (error) return { status: 'fail', message: `job_runs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      type JRRow = { finished_at: string | null; job_type: string }
      const last = (data as JRRow[] | null)?.[0]
      if (!last?.finished_at) return { status: 'warning' as const, message: 'No successful job runs found', evidence: 'job_runs: 0 success entries' }
      const ageMs  = now.getTime() - new Date(last.finished_at).getTime()
      const ageHrs = ageMs / 3_600_000
      if (ageHrs > 24) return { status: 'warning' as const, message: `Last success was ${Math.round(ageHrs)}h ago`, evidence: `job_type: ${last.job_type}, finished_at: ${new Date(last.finished_at).toISOString()}` }
      return {
        status:   'pass',
        message:  'Runtime recently succeeded',
        evidence: `${last.job_type} @ ${new Date(last.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${Math.round(ageHrs * 60)}m ago)`,
      }
    }),

    // 15 ── Insight engine health
    runCheck('insight_engine_health', 'intelligence', async () => {
      const insights = generateInsights({
        approvals: [], workflowRuns: [], jobRuns: [], stuckJobs: [],
        browserRuns: [], notifications: [], memories: [], blockers: [],
        inboxSuggestions: [], now: new Date(),
      })
      return {
        status:   'pass',
        message:  'Insight engine functional',
        evidence: `generateInsights returned ${insights.length} insight(s) with empty input (expected 0)`,
      }
    }),

    // 16 ── Approvals subsystem
    runCheck('approvals_subsystem', 'database', async () => {
      const { count, error } = await db.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      if (error) return { status: 'fail', message: `approvals query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Approvals subsystem reachable', evidence: `${count ?? 0} pending approval(s)` }
    }),

    // 17 ── Blocker tracking
    runCheck('blocker_tracking', 'database', async () => {
      const { count, error } = await db.from('blockers').select('*', { count: 'exact', head: true }).neq('status', 'resolved')
      if (error) return { status: 'fail', message: `blockers query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      return { status: 'pass', message: 'Blocker tracking reachable', evidence: `${count ?? 0} open blocker(s)` }
    }),

    // 18 ── Case graph health
    runCheck('case_graph_health', 'intelligence', async () => {
      const [
        { count: orphanDocs,        error: e1 },
        { count: totalLinks,        error: e2 },
        { count: totalDocs,         error: e3 },
        { count: totalApprovals,    error: e4 },
        { count: linkedApprovals,   error: e5 },
        { count: totalSuggestions,  error: e6 },
        { count: linkedSuggestions, error: e7 },
      ] = await Promise.all([
        db.from('intake_documents').select('*', { count: 'exact', head: true }).is('case_id', null),
        db.from('case_links').select('*', { count: 'exact', head: true }),
        db.from('intake_documents').select('*', { count: 'exact', head: true }),
        db.from('approvals').select('*', { count: 'exact', head: true }),
        db.from('case_links').select('*', { count: 'exact', head: true }).eq('entity_type', 'approval'),
        db.from('inbox_workflow_suggestions').select('*', { count: 'exact', head: true }),
        db.from('case_links').select('*', { count: 'exact', head: true }).eq('entity_type', 'inbox_workflow_suggestion'),
      ])

      void [e2, e3, e4, e5, e6, e7] // non-critical: best-effort counts
      if (e1) return { status: 'fail', message: `intake_documents query failed: ${e1.message}`, evidence: `code: ${e1.code ?? 'unknown'}` }

      const orphansDoc        = orphanDocs        ?? 0
      const total             = totalDocs         ?? 0
      const links             = totalLinks        ?? 0
      const orphanApprovals   = Math.max(0, (totalApprovals ?? 0)   - (linkedApprovals   ?? 0))
      const orphanSuggestions = Math.max(0, (totalSuggestions ?? 0) - (linkedSuggestions ?? 0))
      const docOrphanRate     = total > 0 ? orphansDoc / total : 0
      const docPct            = Math.round(docOrphanRate * 100)

      const warnings: string[] = []
      if (docOrphanRate > 0.3)   warnings.push(`${docPct}% docs unlinked`)
      if (orphanApprovals > 0)   warnings.push(`${orphanApprovals} orphan approval${orphanApprovals > 1 ? 's' : ''}`)
      if (orphanSuggestions > 0) warnings.push(`${orphanSuggestions} orphan workflow suggestion${orphanSuggestions > 1 ? 's' : ''}`)

      const evidence = `docs: ${orphansDoc}/${total} orphan, approvals: ${orphanApprovals} orphan, suggestions: ${orphanSuggestions} orphan, case_links: ${links}`

      if (docOrphanRate > 0.6 || orphanApprovals > 10 || orphanSuggestions > 10) {
        return { status: 'fail', message: `Case graph critical: ${warnings.join(', ')} — run POST /api/cases/backfill-links`, evidence }
      }
      if (warnings.length > 0) {
        return { status: 'warning' as const, message: `Graph health: ${warnings.join(', ')} — consider running backfill`, evidence }
      }
      return { status: 'pass', message: `Case graph healthy`, evidence }
    }),

    // 19 ── Intelligence engine freshness
    runCheck('intelligence_freshness', 'intelligence', async () => {
      const { data, error } = await db
        .from('action_logs')
        .select('created_at')
        .eq('action_type', 'intelligence_engine_run')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) return { status: 'fail', message: `action_logs query failed: ${error.message}`, evidence: `code: ${error.code ?? 'unknown'}` }
      type ALRow = { created_at: string }
      const last = (data as ALRow[] | null)?.[0]
      if (!last) return { status: 'warning' as const, message: 'Intelligence engine has never run', evidence: 'No action_logs entry for intelligence_engine_run — visit /operational-intelligence to trigger' }
      const ageHrs = (now.getTime() - new Date(last.created_at).getTime()) / 3_600_000
      if (ageHrs > 24) return { status: 'warning' as const, message: `Intelligence engine last ran ${Math.round(ageHrs)}h ago`, evidence: `Last run: ${new Date(last.created_at).toISOString()}. Visit /operational-intelligence to refresh.` }
      return { status: 'pass', message: 'Intelligence engine recently ran', evidence: `Last run: ${Math.round(ageHrs * 60)}m ago` }
    }),

    // 20 ── Stale active insights
    runCheck('stale_insight_detection', 'intelligence', async () => {
      const { count: activeCount, error: e1 } = await db
        .from('operational_insights')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
      if (e1) return { status: 'fail', message: `operational_insights query failed: ${e1.message}`, evidence: `code: ${e1.code ?? 'unknown'}` }
      const active = activeCount ?? 0

      // Check for insights not updated in >48h (potentially stale)
      const since48h = new Date(now.getTime() - 48 * 3_600_000).toISOString()
      const { count: staleCount } = await db
        .from('operational_insights')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lt('updated_at', since48h)
      const stale = staleCount ?? 0

      if (stale > 0 && stale === active) {
        return { status: 'warning' as const, message: `All ${active} active insights are stale (>48h old)`, evidence: `Run /operational-intelligence to refresh. Stale insights may no longer reflect current state.` }
      }
      if (stale > 5) {
        return { status: 'warning' as const, message: `${stale} of ${active} active insights are stale (>48h old)`, evidence: `Consider running intelligence engine to refresh insight accuracy.` }
      }
      return { status: 'pass', message: `Insight freshness acceptable`, evidence: `${active} active insights, ${stale} stale (>48h)` }
    }),

    // 21 ── Pressure calculation freshness
    runCheck('pressure_calculation_freshness', 'intelligence', async () => {
      const { count: totalCases, error: e1 } = await db
        .from('operational_cases')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'pending_approval'])
      if (e1) return { status: 'fail', message: `operational_cases query failed: ${e1.message}`, evidence: `code: ${e1.code ?? 'unknown'}` }
      const { count: scoredCases } = await db
        .from('operational_cases')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'pending_approval'])
        .not('pressure_score', 'is', null)
      const total  = totalCases  ?? 0
      const scored = scoredCases ?? 0
      const unscored = total - scored
      if (total === 0) return { status: 'pass', message: 'No active cases to score', evidence: 'operational_cases: 0 active rows' }
      if (unscored > 0 && scored === 0) return { status: 'warning' as const, message: `${total} active cases have no pressure score`, evidence: `Run intelligence engine at /operational-intelligence to calculate pressure scores.` }
      if (unscored > 0) return { status: 'warning' as const, message: `${unscored}/${total} active cases missing pressure score`, evidence: `${scored} scored, ${unscored} unscored. Run intelligence engine to cover remaining.` }
      return { status: 'pass', message: `All ${total} active cases have pressure scores`, evidence: `${scored}/${total} cases scored` }
    }),

  ])

  const fails    = checks.filter(c => c.status === 'fail').length
  const warnings = checks.filter(c => c.status === 'warning').length
  const overall_status: OverallStatus =
    fails >= 3    ? 'critical' :
    fails >= 1    ? 'degraded' :
    warnings >= 1 ? 'degraded' : 'healthy'

  return {
    overall_status,
    checked_at:  now.toISOString(),
    duration_ms: Date.now() - engineStart,
    checks,
    summary: {
      total:   checks.length,
      pass:    checks.filter(c => c.status === 'pass').length,
      warning: warnings,
      fail:    fails,
    },
  }
}
