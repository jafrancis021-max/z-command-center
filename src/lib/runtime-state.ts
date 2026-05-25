import { getAdmin } from './supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuntimeSeverity    = 'severe' | 'mild'
export type RuntimeOverallStatus = 'healthy' | 'degraded' | 'critical'

export interface RuntimeWarning {
  source:  string
  level:   RuntimeSeverity
  message: string
  hint?:   string
}

export interface RuntimeState {
  checked_at:     string
  overall_status: RuntimeOverallStatus
  warnings:       RuntimeWarning[]
  sources: {
    gmail: {
      connected:      boolean
      last_synced_at: string | null
      stale:          boolean
    }
    system_proof: {
      last_checked_at: string | null
      overall_status:  string | null
      stale:           boolean
    }
    job_engine: {
      stuck_count: number
      failed_24h:  number
    }
    event_pipeline: {
      recent_count: number
      flowing:      boolean
    }
  }
}

export interface RuntimeStateSummary {
  status:   RuntimeOverallStatus
  headline: string
  details:  string[]
}

// ── Source checks ─────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getAdmin>

async function checkGmail(db: Db): Promise<RuntimeState['sources']['gmail']> {
  try {
    const { data } = await db
      .from('email_accounts')
      .select('id, status, last_synced_at')
      .eq('status', 'connected')
      .limit(1)

    const row = (data ?? [])[0] as { last_synced_at: string | null } | undefined
    const connected    = !!row
    const lastSynced   = row?.last_synced_at ?? null
    const staleCutoff  = Date.now() - 4 * 3_600_000          // 4 h
    const stale        = connected && lastSynced
      ? new Date(lastSynced).getTime() < staleCutoff
      : false

    return { connected, last_synced_at: lastSynced, stale }
  } catch {
    return { connected: false, last_synced_at: null, stale: false }
  }
}

async function checkSystemProof(db: Db): Promise<RuntimeState['sources']['system_proof']> {
  try {
    const { data } = await db
      .from('system_proof_runs')
      .select('overall_status, checked_at')
      .order('checked_at', { ascending: false })
      .limit(1)

    const row            = (data ?? [])[0] as { overall_status: string; checked_at: string } | undefined
    const lastCheckedAt  = row?.checked_at ?? null
    const overallStatus  = row?.overall_status ?? null
    const staleCutoff    = Date.now() - 24 * 3_600_000        // 24 h
    const stale          = !lastCheckedAt || new Date(lastCheckedAt).getTime() < staleCutoff

    return { last_checked_at: lastCheckedAt, overall_status: overallStatus, stale }
  } catch {
    return { last_checked_at: null, overall_status: null, stale: true }
  }
}

async function checkJobEngine(db: Db): Promise<RuntimeState['sources']['job_engine']> {
  try {
    const now      = new Date().toISOString()
    const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString()

    const [activeRes, failedRes] = await Promise.all([
      db.from('scheduled_jobs').select('last_run_at, next_run_at, schedule_interval_minutes').eq('status', 'active'),
      db.from('job_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('started_at', since24h),
    ])

    type SJRow = { last_run_at: string | null; next_run_at: string; schedule_interval_minutes: number }
    const activeJobs = (activeRes.data ?? []) as SJRow[]
    const stuckCount = activeJobs.filter(j => {
      if (!j.last_run_at || j.next_run_at > now) return false
      const intervalMs = j.schedule_interval_minutes * 60_000
      return Date.now() - new Date(j.last_run_at).getTime() > intervalMs * 2
    }).length

    return { stuck_count: stuckCount, failed_24h: failedRes.count ?? 0 }
  } catch {
    return { stuck_count: 0, failed_24h: 0 }
  }
}

async function checkEventPipeline(db: Db): Promise<RuntimeState['sources']['event_pipeline']> {
  try {
    const since1h = new Date(Date.now() - 3_600_000).toISOString()
    const { count } = await db
      .from('operational_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since1h)

    const recentCount = count ?? 0
    return { recent_count: recentCount, flowing: recentCount > 0 }
  } catch {
    return { recent_count: 0, flowing: false }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getRuntimeState(): Promise<RuntimeState> {
  const db         = getAdmin()
  const checked_at = new Date().toISOString()

  const [gmail, systemProof, jobEngine, eventPipeline] = await Promise.all([
    checkGmail(db),
    checkSystemProof(db),
    checkJobEngine(db),
    checkEventPipeline(db),
  ])

  const warnings: RuntimeWarning[] = []

  // Gmail
  if (!gmail.connected) {
    warnings.push({
      source:  'gmail',
      level:   'severe',
      message: 'Gmail disconnected — email actions unavailable',
      hint:    'Reconnect at /connections',
    })
  } else if (gmail.stale) {
    warnings.push({
      source:  'gmail',
      level:   'mild',
      message: 'Gmail sync is stale — emails may be outdated',
      hint:    'Check sync at /connections',
    })
  }

  // System proof
  if (systemProof.stale) {
    warnings.push({
      source:  'system_proof',
      level:   systemProof.last_checked_at ? 'mild' : 'severe',
      message: systemProof.last_checked_at
        ? 'System proof stale — last check was over 24h ago'
        : 'System proof has never run — runtime health unknown',
      hint:    'Run a check at /system-proof',
    })
  } else if (systemProof.overall_status === 'critical') {
    warnings.push({
      source:  'system_proof',
      level:   'severe',
      message: 'System proof critical — subsystem(s) failing',
      hint:    'Review failures at /system-proof',
    })
  } else if (systemProof.overall_status === 'degraded') {
    warnings.push({
      source:  'system_proof',
      level:   'mild',
      message: 'System proof degraded — some checks have warnings',
      hint:    'Review at /system-proof',
    })
  }

  // Job engine
  if (jobEngine.stuck_count > 0) {
    warnings.push({
      source:  'job_engine',
      level:   'severe',
      message: `${jobEngine.stuck_count} scheduled job(s) appear stuck`,
      hint:    'Inspect at /workflows',
    })
  } else if (jobEngine.failed_24h > 0) {
    warnings.push({
      source:  'job_engine',
      level:   'mild',
      message: `${jobEngine.failed_24h} job run(s) failed in the last 24h`,
      hint:    'Review at /workflows',
    })
  }

  const hasSevere = warnings.some(w => w.level === 'severe')
  const hasMild   = warnings.some(w => w.level === 'mild')
  const overall_status: RuntimeOverallStatus =
    hasSevere ? 'critical' : hasMild ? 'degraded' : 'healthy'

  return {
    checked_at,
    overall_status,
    warnings,
    sources: {
      gmail,
      system_proof: systemProof,
      job_engine:   jobEngine,
      event_pipeline: eventPipeline,
    },
  }
}

export async function getRuntimeWarnings(): Promise<RuntimeWarning[]> {
  const state = await getRuntimeState()
  return state.warnings
}

export async function getRuntimeStateSummary(): Promise<RuntimeStateSummary> {
  const state = await getRuntimeState()

  if (state.warnings.length === 0) {
    return { status: 'healthy', headline: 'All systems operational', details: [] }
  }

  const severeCount = state.warnings.filter(w => w.level === 'severe').length
  const headline    = severeCount > 0
    ? `${state.warnings.length} runtime warning(s) — ${severeCount} severe`
    : `${state.warnings.length} runtime warning(s)`

  const details = state.warnings.map(w =>
    `[${w.level.toUpperCase()}] ${w.message}${w.hint ? ` (${w.hint})` : ''}`
  )

  return { status: state.overall_status, headline, details }
}

// ── Suggested assistant behavior per warning source ───────────────────────────

const BEHAVIOR_HINTS: Record<string, string> = {
  gmail:        'Do not suggest email-dependent actions until Gmail is reconnected.',
  system_proof: 'Inform the user that runtime health is uncertain before recommending system-level actions.',
  job_engine:   'Note that scheduled jobs may be unreliable; manual workflow execution is preferred.',
}

export function suggestedBehaviorForWarnings(warnings: RuntimeWarning[]): string[] {
  const seen = new Set<string>()
  const hints: string[] = []
  for (const w of warnings) {
    if (!seen.has(w.source) && BEHAVIOR_HINTS[w.source]) {
      hints.push(BEHAVIOR_HINTS[w.source])
      seen.add(w.source)
    }
  }
  return hints
}
