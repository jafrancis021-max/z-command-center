'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ScheduledJob, JobRun } from '@/types'

interface JobsStatus {
  active_jobs:  ScheduledJob[]
  due_jobs:     ScheduledJob[]
  recent_runs:  JobRun[]
  failed_runs:  JobRun[]
  stuck_jobs:   ScheduledJob[]
  warnings:     string[]
  summary: {
    total_active:    number
    total_paused:    number
    total_due:       number
    failed_runs_24h: number
    stuck_count:     number
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
    <span className={`inline-flex items-center gap-1 text-[8.5px] font-medium px-1.5 py-0.5 rounded-md capitalize ${s.bg} ${s.text}`}>
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
      <div className="bg-[#0d0d0d] border border-[#191919] rounded-2xl p-4 animate-pulse">
        <div className="h-2.5 w-40 bg-[#181818] rounded mb-2.5" />
        <div className="h-2 w-56 bg-[#161616] rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#0d0d0d] border border-[#191919] rounded-2xl px-4 py-3">
        <p className="text-[9.5px] text-red-400">⚠ Operational Runtime: {error}</p>
        <p className="text-[8.5px] text-[#3a3a3a] mt-1">Run migration 006_phase2c_scheduled_jobs.sql in Supabase first.</p>
      </div>
    )
  }

  if (!data) return null

  const { active_jobs, recent_runs, failed_runs, stuck_jobs = [], summary } = data

  return (
    <section>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[10.5px] font-semibold text-[#909090] uppercase tracking-[0.09em]">Runtime</h2>
          <span className="text-[8px] text-[#707070] bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded-full tabular-nums">
            {summary.total_active} active
          </span>
          {summary.stuck_count > 0 && (
            <span className="text-[8px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded-full animate-op-pulse">
              {summary.stuck_count} stuck
            </span>
          )}
          {summary.failed_runs_24h > 0 && (
            <span className="text-[8px] text-red-400">⚠ {summary.failed_runs_24h} failed</span>
          )}
        </div>
        {lastRefresh && (
          <p className="text-[8px] text-[#6a6a6a] font-mono shrink-0">
            {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Jobs table */}
      <div className="bg-[#090909] border border-[#191919] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_72px_80px_80px_60px] text-[8px] text-[#707070] uppercase tracking-[0.1em] px-3 py-2 border-b border-[#141414]">
          <span>Job</span>
          <span>Status</span>
          <span>Last run</span>
          <span>Next run</span>
          <span>Intv</span>
        </div>
        {active_jobs.length === 0 ? (
          <p className="text-[9.5px] text-[#333] px-4 py-6 text-center">No jobs registered. Run the migration.</p>
        ) : (
          active_jobs.map((job, i) => {
            const isDue   = job.next_run_at <= new Date().toISOString()
            const isStuck = stuck_jobs.some(s => s.id === job.id)
            return (
              <div
                key={job.id}
                className={`grid grid-cols-[1fr_72px_80px_80px_60px] px-3 py-2 items-center ${
                  i < active_jobs.length - 1 ? 'border-b border-[#111]' : ''
                } ${isStuck ? 'bg-[#f59e0b]/[0.025]' : isDue ? 'bg-[#f59e0b]/[0.01]' : ''}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9.5px] text-[#c0c0c0] font-medium truncate leading-snug">{job.name}</p>
                    {isStuck && (
                      <span className="shrink-0 text-[7.5px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1 py-0.5 rounded leading-none">
                        stuck
                      </span>
                    )}
                  </div>
                  {job.description && (
                    <p className="text-[8.5px] text-[#909090] truncate mt-px">{job.description}</p>
                  )}
                </div>
                <StatusBadge status={job.status} />
                <span className="text-[8.5px] text-[#909090] tabular-nums font-mono">{relativeTime(job.last_run_at)}</span>
                <span className={`text-[8.5px] tabular-nums font-mono ${isDue ? 'text-[#f59e0b]' : 'text-[#909090]'}`}>
                  {relativeTime(job.next_run_at)}
                </span>
                <span className="text-[8.5px] text-[#707070] font-mono">
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
        <div className="mt-2.5">
          <p className="text-[8px] text-[#686868] uppercase tracking-[0.12em] font-semibold mb-1.5">Recent Runs</p>
          <div className="bg-[#090909] border border-[#191919] rounded-2xl overflow-hidden">
            {recent_runs.slice(0, 5).map((run, i) => (
              <div
                key={run.id}
                className={`flex items-center gap-2 px-3 py-1.5 ${i < Math.min(recent_runs.length, 5) - 1 ? 'border-b border-[#111]' : ''}`}
              >
                <StatusBadge status={run.status} />
                <span className="text-[#909090] font-mono text-[8.5px] shrink-0">{run.job_type}</span>
                <span className="flex-1 truncate text-[8.5px] text-[#909090]">
                  {run.error_message ?? (run.duration_ms != null ? `${run.duration_ms}ms` : '')}
                </span>
                <span className="text-[7.5px] text-[#6a6a6a] font-mono shrink-0 tabular-nums">
                  {relativeTime(run.started_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failures */}
      {failed_runs.length > 0 && (
        <div className="mt-2.5 bg-red-500/[0.04] border border-red-500/15 rounded-2xl px-3 py-2.5">
          <p className="text-[9px] font-medium text-red-400 mb-1.5">
            ⚠ {failed_runs.length} failure(s) in the last 24h
          </p>
          <div className="space-y-1">
            {failed_runs.map(run => (
              <div key={run.id} className="text-[8.5px] text-[#555] flex gap-2">
                <span className="font-mono text-red-400/60 shrink-0">{run.job_type}</span>
                <span className="truncate">{run.error_message ?? 'no error message'}</span>
                <span className="shrink-0 text-[#3a3a3a] font-mono tabular-nums">{relativeTime(run.started_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
