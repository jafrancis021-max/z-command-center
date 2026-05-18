import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import type { ScheduledJob, JobRun } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db  = getAdmin()
  const now = new Date().toISOString()

  try {
    // All scheduled_jobs (active + paused)
    const { data: jobRows, error: jobErr } = await db
      .from('scheduled_jobs')
      .select('*')
      .order('name', { ascending: true })

    if (jobErr) throw jobErr

    const allJobs     = (jobRows ?? []) as ScheduledJob[]
    const activeJobs  = allJobs.filter(j => j.status === 'active')
    const dueJobs     = activeJobs.filter(j => j.next_run_at <= now)

    // Last 20 runs (any status)
    const { data: runRows, error: runErr } = await db
      .from('job_runs')
      .select('id, scheduled_job_id, job_type, status, started_at, finished_at, duration_ms, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (runErr) throw runErr

    const recentRuns = (runRows ?? []) as JobRun[]

    // Failed runs in the last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const failedRuns24h = recentRuns.filter(
      r => r.status === 'failed' && r.started_at >= since24h,
    )

    return NextResponse.json({
      active_jobs:  activeJobs,
      due_jobs:     dueJobs,
      recent_runs:  recentRuns,
      failed_runs:  failedRuns24h,
      summary: {
        total_active:         activeJobs.length,
        total_paused:         allJobs.filter(j => j.status === 'paused').length,
        total_due:            dueJobs.length,
        failed_runs_24h:      failedRuns24h.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/jobs/status] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
