'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PRESSURE_CFG } from '@/lib/operational-pressure'
import type { DailyBriefData } from '@/app/api/daily-brief/route'

export default function DailyBrief() {
  const [brief,   setBrief]   = useState<DailyBriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [open,    setOpen]    = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-brief')
      if (res.ok) setBrief(await res.json())
      else setError('Could not load brief')
    } catch {
      setError('Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="bg-[#090909] border border-[#181818] rounded-2xl px-5 py-3.5 animate-pulse flex items-center gap-3">
        <div className="w-8 h-5 bg-[#161616] rounded-full" />
        <div className="h-2.5 w-48 bg-[#161616] rounded" />
        <div className="ml-auto h-2 w-24 bg-[#141414] rounded" />
      </div>
    )
  }

  if (error || !brief) return null

  const pressure = brief.pressure
  const pcfg     = PRESSURE_CFG[pressure.level]

  return (
    <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
      {/* Compact header row — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#0d0d0d] transition-colors text-left"
      >
        {/* Pressure badge */}
        <span className={`shrink-0 flex items-center gap-1.5 text-[9px] font-semibold px-2.5 py-1 rounded-lg border ${pcfg.bg} ${pcfg.color} ${pcfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pcfg.dot} ${pressure.level === 'elevated' || pressure.level === 'high' ? 'animate-pulse' : ''}`} />
          {pcfg.label} Pressure
        </span>

        {/* Key action or summary */}
        <p className="flex-1 text-[9.5px] text-[#909090] truncate">
          {brief.key_action
            ? brief.key_action
            : `${brief.insights.total} insight${brief.insights.total !== 1 ? 's' : ''} · ${brief.approvals.pending} pending approval${brief.approvals.pending !== 1 ? 's' : ''} · ${brief.blockers.open} open blocker${brief.blockers.open !== 1 ? 's' : ''}`
          }
        </p>

        {/* Insights count */}
        {brief.insights.critical > 0 && (
          <span className="shrink-0 text-[8px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
            {brief.insights.critical} critical
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/insights"
            onClick={e => e.stopPropagation()}
            className="text-[8.5px] text-[#555] hover:text-[#aaa] transition-colors border border-[#1e1e1e] px-2 py-0.5 rounded"
          >
            View insights →
          </Link>
          <span className={`text-[9px] text-[#333] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
        </div>
      </button>

      {/* Expanded brief */}
      {open && (
        <div className="border-t border-[#141414] px-5 py-4">

          {/* Pressure bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8px] text-[#555] uppercase tracking-[0.1em]">Operational Pressure</span>
              <span className={`text-[8.5px] font-semibold tabular-nums ${pcfg.color}`}>{pressure.score}/100</span>
            </div>
            <div className="h-1 bg-[#141414] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  pressure.level === 'high'     ? 'bg-red-500'    :
                  pressure.level === 'elevated' ? 'bg-[#f59e0b]'  :
                  pressure.level === 'moderate' ? 'bg-[#666]'     : 'bg-[#22c55e]'
                }`}
                style={{ width: `${pressure.score}%` }}
              />
            </div>
            {pressure.primary_driver && (
              <p className="text-[7.5px] text-[#4a4a4a] mt-1">Primary driver: {pressure.primary_driver}</p>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Browser runs',  value: brief.execution.browser_runs_today,  sub: `${brief.execution.browser_failed} failed`,  color: brief.execution.browser_failed > 0 ? 'text-[#f59e0b]' : 'text-[#d0d0d0]' },
              { label: 'Workflow runs', value: brief.execution.workflow_runs_today, sub: `${brief.execution.workflow_failed} failed`, color: brief.execution.workflow_failed > 0 ? 'text-[#f59e0b]' : 'text-[#d0d0d0]' },
              { label: 'Pending approvals', value: brief.approvals.pending, sub: brief.approvals.stale > 0 ? `${brief.approvals.stale} stale` : 'all fresh', color: brief.approvals.stale > 0 ? 'text-[#f59e0b]' : 'text-[#d0d0d0]' },
              { label: 'Open blockers', value: brief.blockers.open, sub: brief.blockers.critical > 0 ? `${brief.blockers.critical} critical` : 'none critical', color: brief.blockers.critical > 0 ? 'text-red-400' : 'text-[#d0d0d0]' },
            ].map(s => (
              <div key={s.label} className="bg-[#070707] border border-[#161616] rounded-xl px-3 py-2">
                <p className={`text-[18px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[8px] text-[#666] mt-1">{s.label}</p>
                <p className="text-[7.5px] text-[#3a3a3a] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Pressure factors */}
          {pressure.factors.length > 0 && (
            <div className="mb-4">
              <p className="text-[7.5px] text-[#3a3a3a] uppercase tracking-[0.1em] mb-2">Pressure Factors</p>
              <div className="space-y-1">
                {pressure.factors.map(f => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="text-[8px] text-[#666] w-28 shrink-0 truncate">{f.name}</span>
                    <div className="flex-1 h-1 bg-[#141414] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pcfg.dot}`}
                        style={{ width: `${(f.contribution / 30) * 100}%`, opacity: 0.7 }}
                      />
                    </div>
                    <span className="text-[7.5px] text-[#444] font-mono w-5 text-right">{f.contribution}</span>
                    <span className="text-[7.5px] text-[#333] flex-1 truncate">{f.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top insight */}
          {brief.insights.top_insight && (
            <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${
              brief.insights.top_insight.severity === 'critical' ? 'bg-red-500/[0.04] border-red-500/15' :
              brief.insights.top_insight.severity === 'high'     ? 'bg-[#f59e0b]/[0.04] border-[#f59e0b]/15' :
              'bg-[#0e0e0e] border-[#1c1c1c]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                brief.insights.top_insight.severity === 'critical' ? 'bg-red-500' :
                brief.insights.top_insight.severity === 'high'     ? 'bg-[#f59e0b]' : 'bg-[#555]'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-medium text-[#b0b0b0] leading-snug">{brief.insights.top_insight.title}</p>
                <p className="text-[7.5px] text-[#555] mt-0.5 uppercase tracking-wide">{brief.insights.top_insight.area}</p>
              </div>
              <Link
                href="/insights"
                className="text-[8px] text-[#444] hover:text-[#888] transition-colors shrink-0"
              >
                All {brief.insights.total} →
              </Link>
            </div>
          )}

          {/* Runtime + memory row */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#141414]">
            <span className={`flex items-center gap-1.5 text-[8px] ${
              brief.runtime.status === 'healthy' ? 'text-[#22c55e]' :
              brief.runtime.status === 'degraded' ? 'text-[#f59e0b]' : 'text-red-400'
            }`}>
              <span className={`w-1 h-1 rounded-full ${
                brief.runtime.status === 'healthy' ? 'bg-[#22c55e]' :
                brief.runtime.status === 'degraded' ? 'bg-[#f59e0b] animate-pulse' : 'bg-red-500 animate-pulse'
              }`} />
              Runtime {brief.runtime.status}
            </span>
            <span className="text-[8px] text-[#3a3a3a]">
              {brief.runtime.active_jobs} active job{brief.runtime.active_jobs !== 1 ? 's' : ''}
            </span>
            {brief.runtime.stuck_jobs > 0 && (
              <span className="text-[8px] text-[#f59e0b]">{brief.runtime.stuck_jobs} stuck</span>
            )}
            <span className="ml-auto text-[8px] text-[#3a3a3a]">
              {brief.memories.active} operational memor{brief.memories.active !== 1 ? 'ies' : 'y'}
            </span>
            <span className="text-[7px] text-[#252525] font-mono">
              {new Date(brief.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
