'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ScheduledJob, JobRun } from '@/types'

interface JobsStatus {
  active_jobs:  ScheduledJob[]
  due_jobs:     ScheduledJob[]
  recent_runs:  JobRun[]
  failed_runs:  JobRun[]
  summary: {
    total_active:    number
    total_paused:    number
    total_due:       number
    failed_runs_24h: number
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(Math.abs(diff) / 60_000)
  const past = diff > 0
  if (mins < 60)   return past ? `${mins}m ago` : `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)    return past ? `${hrs}h ago` : `in ${hrs}h`
  return past ? `${Math.floor(hrs / 24)}d ago` : `in ${Math.floor(hrs / 24)}d`
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; dot: string }> = {
    active:  { bg: 'bg-[#22c55e]/10', text: 'text-[#22c55e]', dot: 'bg-[#22c55e]' },
    paused:  { bg: 'bg-[#525252]/10', text: 'text-[#525252]', dot: 'bg-[#525252]' },
    failed:  { bg: 'bg-red-500/10',   text: 'text-red-400',   dot: 'bg-red-500'   },
    running: { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]', dot: 'bg-[#f59e0b] animate-pulse' },
    success: { bg: 'bg-[#22c55e]/10', text: 'text-[#22c55e]', dot: 'bg-[#22c55e]' },
  }
  const s = cfg[status] ?? cfg.paused
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1 h-1 rounded-full shrink-0 ${s.dot}`} />
      {status}
    </span>
  )
}

export default function OperationalRuntime() {
  const [data, setData]       = useState<JobsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/jobs/status')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load job status')
      setData(json as JobsStatus)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return (
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 animate-pulse">
        <div className="h-3 w-40 bg-[#1a1a1a] rounded mb-3" />
        <div className="h-2 w-64 bg-[#1a1a1a] rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
        <p className="text-xs text-red-400">⚠ Operational Runtime: {error}</p>
        <p className="text-[10px] text-[#525252] mt-1">Run migration 006_phase2c_scheduled_jobs.sql in Supabase first.</p>
      </div>
    )
  }

  if (!data) return null

  const { active_jobs, recent_runs, failed_runs, summary } = data

  return (
    <section>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e5e5]">Operational Runtime</h2>
          <p className="text-xs text-[#525252]">
            {summary.total_active} active jobs · {summary.total_due} due now
            {summary.failed_runs_24h > 0 && (
              <span className="text-red-400 ml-2">· {summary.failed_runs_24h} failure(s) today</span>
            )}
          </p>
        </div>
        {lastRefresh && (
          <p className="text-[10px] text-[#525252] shrink-0">
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Jobs table */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_90px_90px_80px] text-[10px] text-[#525252] uppercase tracking-wider px-4 py-2 border-b border-[#1a1a1a]">
          <span>Job</span>
          <span>Status</span>
          <span>Last run</span>
          <span>Next run</span>
          <span>Interval</span>
        </div>
        {active_jobs.length === 0 ? (
          <p className="text-xs text-[#525252] px-4 py-6 text-center">No jobs registered. Run the migration.</p>
        ) : (
          active_jobs.map((job, i) => {
            const isDue = job.next_run_at <= new Date().toISOString()
            return (
              <div
                key={job.id}
                className={`grid grid-cols-[1fr_80px_90px_90px_80px] px-4 py-2.5 text-xs items-center ${
                  i < active_jobs.length - 1 ? 'border-b border-[#1a1a1a]' : ''
                } ${isDue ? 'bg-[#f59e0b]/[0.03]' : ''}`}
              >
                <div>
                  <p className="text-[#e5e5e5] font-medium truncate">{job.name}</p>
                  {job.description && (
                    <p className="text-[10px] text-[#525252] truncate mt-0.5">{job.description}</p>
                  )}
                </div>
                <StatusBadge status={job.status} />
                <span className="text-[#737373]">{relativeTime(job.last_run_at)}</span>
                <span className={isDue ? 'text-[#f59e0b]' : 'text-[#737373]'}>
                  {relativeTime(job.next_run_at)}
                </span>
                <span className="text-[#525252]">
                  {job.schedule_interval_minutes < 60
                    ? `${job.schedule_interval_minutes}m`
                    : job.schedule_interval_minutes < 1440
                    ? `${job.schedule_interval_minutes / 60}h`
                    : `${job.schedule_interval_minutes / 1440}d`}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Recent runs */}
      {recent_runs.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">Recent Runs</p>
          <div className="space-y-1">
            {recent_runs.slice(0, 6).map(run => (
              <div
                key={run.id}
                className="flex items-center gap-3 text-xs bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-1.5"
              >
                <StatusBadge status={run.status} />
                <span className="text-[#737373] font-mono text-[10px]">{run.job_type}</span>
                <span className="flex-1 truncate text-[#525252]">
                  {run.error_message ?? (run.duration_ms != null ? `${run.duration_ms}ms` : '')}
                </span>
                <span className="text-[10px] text-[#525252] shrink-0">
                  {relativeTime(run.started_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failures */}
      {failed_runs.length > 0 && (
        <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs font-medium text-red-400 mb-2">
            ⚠ {failed_runs.length} failure(s) in the last 24h
          </p>
          <div className="space-y-1">
            {failed_runs.map(run => (
              <div key={run.id} className="text-[10px] text-[#737373] flex gap-2">
                <span className="font-mono text-red-400/70 shrink-0">{run.job_type}</span>
                <span className="truncate">{run.error_message ?? 'no error message'}</span>
                <span className="shrink-0 text-[#525252]">{relativeTime(run.started_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
