/**
 * job-executor.ts — core scheduled job runtime
 *
 * - Queries scheduled_jobs for due active jobs (next_run_at <= NOW())
 * - Creates a job_run record, calls the registered handler
 * - Writes structured logs to job_logs
 * - Updates last_run_at / next_run_at on completion
 * - Isolates failures: one job crashing never blocks the next
 *
 * NOTE: Single-instance design. Run one worker process at a time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdmin } from '@/lib/supabase-server'
import type { ScheduledJob, JobRun, JobResult } from '@/types'
import { handlers, type LogFn } from '@/lib/job-handlers'

// ── Logger ────────────────────────────────────────────────────────────────────

function makeLogger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  runId: string,
  jobType: string,
): LogFn {
  return async (level, message, metadata = {}) => {
    console.log(`[job/${jobType}/${runId.slice(0, 8)}] [${level.toUpperCase()}] ${message}`)
    try {
      await db.from('job_logs').insert({ job_run_id: runId, level, message, metadata })
    } catch { /* non-critical — never let logging break the job */ }
  }
}

// ── Single job execution ──────────────────────────────────────────────────────

async function executeJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  job: ScheduledJob,
): Promise<void> {
  const startedAt = new Date()
  console.log(`[job-executor] ── Starting ${job.job_type} (id: ${job.id})`)

  // Create the job_run record
  const { data: runRow, error: runErr } = await db
    .from('job_runs')
    .insert({
      scheduled_job_id: job.id,
      job_type:         job.job_type,
      status:           'running',
      started_at:       startedAt.toISOString(),
    })
    .select()
    .single()

  if (runErr || !runRow) {
    console.error(`[job-executor] Failed to create job_run for ${job.job_type}:`, runErr?.message)
    return
  }

  const run    = runRow as JobRun
  const log    = makeLogger(db, run.id, job.job_type)

  await log('info', `Job started — name: ${job.name}`, { interval_minutes: job.schedule_interval_minutes })

  let result:       JobResult
  let runStatus:    'success' | 'failed' = 'success'
  let errorMessage: string | null = null

  try {
    const handler = handlers[job.job_type]
    if (!handler) throw new Error(`No handler registered for job_type: "${job.job_type}"`)

    result = await handler(db, job.config ?? {}, log)

    if (!result.ok) {
      // Handler reported soft failure — still counts as completed, log at warn
      await log('warn', `Handler returned ok=false: ${result.message}`)
    } else {
      await log('info', `Job succeeded: ${result.message}`, { actions: result.actions_taken })
    }
  } catch (err) {
    runStatus    = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    result       = {
      ok:                      false,
      message:                 errorMessage,
      actions_taken:           [],
      next_recommended_action: 'Inspect job_logs for this run',
    }
    await log('error', `Job threw: ${errorMessage}`)
    console.error(`[job-executor] ${job.job_type} threw:`, errorMessage)
  }

  const finishedAt  = new Date()
  const durationMs  = finishedAt.getTime() - startedAt.getTime()

  // Finalise job_run
  await db.from('job_runs').update({
    status:        runStatus,
    finished_at:   finishedAt.toISOString(),
    duration_ms:   durationMs,
    error_message: errorMessage,
    result,
  }).eq('id', run.id)

  // Advance the schedule
  const nextRunAt = new Date(Date.now() + job.schedule_interval_minutes * 60_000).toISOString()
  await db.from('scheduled_jobs').update({
    last_run_at: finishedAt.toISOString(),
    next_run_at: nextRunAt,
    updated_at:  finishedAt.toISOString(),
  }).eq('id', job.id)

  console.log(
    `[job-executor] ── Finished ${job.job_type} | ${runStatus.toUpperCase()} | ${durationMs}ms` +
    ` | next: ${new Date(nextRunAt).toLocaleTimeString()}`,
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runDueJobs(): Promise<{ ran: number; failed: number }> {
  const db  = getAdmin()
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('scheduled_jobs')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })

  if (error) {
    console.error('[job-executor] Failed to fetch due jobs:', error.message)
    return { ran: 0, failed: 0 }
  }

  const jobs = (data ?? []) as ScheduledJob[]

  if (!jobs.length) {
    console.log(`[job-executor] No due jobs at ${now}`)
    return { ran: 0, failed: 0 }
  }

  console.log(`[job-executor] ${jobs.length} due job(s): ${jobs.map(j => j.job_type).join(', ')}`)

  let ran = 0
  let failed = 0

  for (const job of jobs) {
    try {
      await executeJob(db, job)
      ran++
    } catch (err) {
      // executeJob should never throw, but just in case
      failed++
      console.error(`[job-executor] Unhandled error for ${job.job_type}:`, err)
    }
  }

  return { ran, failed }
}
