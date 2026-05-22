'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PRESSURE_CFG, type PressureScore } from '@/lib/operational-pressure'
import type { EngineInsight } from '@/lib/operational-insight-engine'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkspaceInsight {
  project_id:        string
  project_name:      string
  status:            string
  risk_level:        string | null
  pressure:          PressureScore
  open_blockers:     number
  pending_approvals: number
  workflow_failures: number
}

interface InsightsResponse {
  insights:            EngineInsight[]
  pressure:            PressureScore
  workspace_insights:  WorkspaceInsight[]
  generated_at:        string
  summary: {
    total: number; critical: number; high: number; medium: number; low: number
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const SEV_CFG: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
  critical: { dot: 'bg-red-500',    text: 'text-red-700',   bg: 'bg-red-50',    border: 'border-red-200',    label: 'Critical' },
  high:     { dot: 'bg-amber-400',  text: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'High'     },
  medium:   { dot: 'bg-gray-400',   text: 'text-gray-500',  bg: 'bg-gray-50',   border: 'border-gray-200',   label: 'Medium'   },
  low:      { dot: 'bg-gray-300',   text: 'text-gray-400',  bg: 'bg-gray-50',   border: 'border-gray-200',   label: 'Low'      },
}

const AREA_LABELS: Record<string, string> = {
  approval:  'Approvals',
  workflow:  'Workflows',
  runtime:   'Runtime',
  execution: 'Execution',
  blocker:   'Blockers',
  inbox:     'Inbox',
  memory:    'Memory',
  general:   'General',
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: EngineInsight }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SEV_CFG[insight.severity] ?? SEV_CFG.medium

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-150 animate-timeline-enter ${cfg.bg} ${cfg.border}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[8.5px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                {cfg.label}
              </span>
              <span className="text-[8px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded capitalize">
                {AREA_LABELS[insight.area] ?? insight.area}
              </span>
              <span className="text-[7.5px] text-gray-300 ml-auto font-mono">
                {insight.confidence}% confidence
              </span>
            </div>
            <p className="text-[10.5px] font-semibold text-gray-700 leading-snug">{insight.title}</p>
          </div>
          <span className={`text-[9px] text-gray-300 transition-transform duration-150 shrink-0 mt-1 ${expanded ? 'rotate-90' : ''}`}>›</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-200/50">
          <p className="text-[9.5px] text-gray-500 leading-relaxed">{insight.description}</p>

          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 space-y-2">
            <div>
              <p className="text-[7.5px] text-gray-400 uppercase tracking-[0.1em] mb-1">Why it matters</p>
              <p className="text-[9px] text-gray-500 leading-relaxed">{insight.why_it_matters}</p>
            </div>
            <div className="border-t border-gray-100 pt-2">
              <p className="text-[7.5px] text-gray-400 uppercase tracking-[0.1em] mb-1">Recommendation</p>
              <p className="text-[9px] text-gray-500 leading-relaxed">{insight.recommendation}</p>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="flex items-center gap-2">
            <span className="text-[7.5px] text-gray-400 w-16 shrink-0">Confidence</span>
            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${cfg.dot}`}
                style={{ width: `${insight.confidence}%`, opacity: 0.8 }}
              />
            </div>
            <span className="text-[7.5px] text-gray-400 font-mono w-8 text-right">{insight.confidence}%</span>
          </div>

          {insight.source_ids.length > 0 && (
            <p className="text-[7.5px] text-gray-300">
              {insight.source_ids.length} source record{insight.source_ids.length > 1 ? 's' : ''} · {insight.insight_type}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Workspace intelligence card ────────────────────────────────────────────────

function WorkspaceCard({ ws }: { ws: WorkspaceInsight }) {
  const pcfg = PRESSURE_CFG[ws.pressure.level]
  const hasIssues = ws.pressure.score > 0

  return (
    <div className={`bg-white border rounded-xl px-4 py-3 shadow-sm ${
      hasIssues ? 'border-gray-300' : 'border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-700">{ws.project_name}</span>
          <span className={`text-[7.5px] px-1.5 py-0.5 rounded border ${pcfg.bg} ${pcfg.color} ${pcfg.border}`}>
            {pcfg.label}
          </span>
        </div>
        <span className={`text-[9px] font-bold tabular-nums ${pcfg.color}`}>{ws.pressure.score}</span>
      </div>

      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-2.5">
        <div
          className={`h-full rounded-full ${pcfg.dot}`}
          style={{ width: `${ws.pressure.score}%`, opacity: 0.7 }}
        />
      </div>

      <div className="flex items-center gap-3 text-[7.5px]">
        <span className={ws.open_blockers > 0 ? 'text-red-600' : 'text-gray-300'}>
          {ws.open_blockers} blocker{ws.open_blockers !== 1 ? 's' : ''}
        </span>
        <span className={ws.pending_approvals > 0 ? 'text-amber-700' : 'text-gray-300'}>
          {ws.pending_approvals} approval{ws.pending_approvals !== 1 ? 's' : ''}
        </span>
        {ws.workflow_failures > 0 && (
          <span className="text-red-600">{ws.workflow_failures} WF failures</span>
        )}
        <Link
          href={`/projects/${ws.project_id}`}
          className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
        >
          Open →
        </Link>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function InsightSection({
  title, insights, defaultExpanded = true,
}: {
  title: string
  insights: EngineInsight[]
  defaultExpanded?: boolean
}) {
  const [open, setOpen] = useState(defaultExpanded)
  if (insights.length === 0) return null

  const sev = insights[0].severity
  const cfg = SEV_CFG[sev] ?? SEV_CFG.medium

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 mb-2 group"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.12em]">{title}</span>
        <span className="text-[8px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
          {insights.length}
        </span>
        <div className="flex-1 h-px bg-gray-200" />
        <span className={`text-[9px] text-gray-300 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="space-y-2">
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [data,       setData]       = useState<InsightsResponse | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/insights')
      if (res.ok) {
        setData(await res.json())
        setLastUpdate(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const pressure = data?.pressure
  const pcfg     = pressure ? PRESSURE_CFG[pressure.level] : null

  const criticalInsights = data?.insights.filter(i => i.severity === 'critical') ?? []
  const highInsights     = data?.insights.filter(i => i.severity === 'high')     ?? []
  const mediumInsights   = data?.insights.filter(i => i.severity === 'medium')   ?? []
  const lowInsights      = data?.insights.filter(i => i.severity === 'low')      ?? []

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 5v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 3l-1.5-1.5M14 3l1.5-1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Operational Intelligence</h1>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {pressure && pcfg && (
            <span className={`flex items-center gap-1.5 text-[8.5px] font-medium px-2.5 py-1 rounded-lg border ${pcfg.bg} ${pcfg.color} ${pcfg.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pcfg.dot} ${pressure.level === 'high' || pressure.level === 'elevated' ? 'animate-pulse' : ''}`} />
              {pcfg.label} Pressure · {pressure.score}
            </span>
          )}
          {lastUpdate && (
            <span className="text-[7.5px] text-gray-300 font-mono">
              {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} className="text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors">↺</button>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1200px] mx-auto">

        {loading && !data ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-14 bg-gray-100 rounded-2xl" />
            <div className="grid grid-cols-5 gap-2">
              {[0,1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
            </div>
            {[0,1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-6">

            {/* Pressure breakdown */}
            {pressure && pcfg && (
              <div className={`rounded-2xl border px-5 py-4 ${pcfg.bg} ${pcfg.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold ${pcfg.color}`}>
                      {pcfg.label} Operational Pressure
                    </span>
                    <span className={`text-[20px] font-bold tabular-nums ${pcfg.color}`}>{pressure.score}</span>
                    <span className="text-[9px] text-gray-400">/ 100</span>
                  </div>
                  {pressure.primary_driver && (
                    <span className="text-[8.5px] text-gray-500">Primary driver: {pressure.primary_driver}</span>
                  )}
                </div>
                {pressure.factors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pressure.factors.map(f => (
                      <div key={f.name} className="flex items-center gap-1.5 bg-white/70 border border-gray-200 rounded-lg px-2.5 py-1.5">
                        <span className="text-[8px] text-gray-500">{f.name}</span>
                        <span className={`text-[9px] font-semibold tabular-nums ${pcfg.color}`}>+{f.contribution}</span>
                        <span className="text-[7.5px] text-gray-400">— {f.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pressure.factors.length === 0 && (
                  <p className="text-[9px] text-green-700">All operational systems operating normally. No pressure factors detected.</p>
                )}
              </div>
            )}

            {/* Summary strip */}
            {data && (
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Total',    value: data.summary.total,    color: 'text-gray-400'  },
                  { label: 'Critical', value: data.summary.critical, color: 'text-red-600'   },
                  { label: 'High',     value: data.summary.high,     color: 'text-amber-600' },
                  { label: 'Medium',   value: data.summary.medium,   color: 'text-gray-500'  },
                  { label: 'Low',      value: data.summary.low,      color: 'text-gray-300'  },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-center shadow-sm">
                    <p className={`text-[18px] font-bold tabular-nums ${s.color}`}>{s.value}</p>
                    <p className="text-[7.5px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
              {/* Insights column */}
              <div className="space-y-5">
                {data?.insights.length === 0 ? (
                  <div className="text-center py-20 bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <p className="text-[22px] mb-3 text-[#10B981]">✓</p>
                    <p className="text-[12px] font-semibold text-gray-400">No active operational insights</p>
                    <p className="text-[9.5px] text-gray-300 mt-1">System is operating within normal parameters</p>
                  </div>
                ) : (
                  <>
                    <InsightSection title="Critical" insights={criticalInsights} defaultExpanded />
                    <InsightSection title="High Priority" insights={highInsights} defaultExpanded />
                    <InsightSection title="Medium" insights={mediumInsights} defaultExpanded={criticalInsights.length + highInsights.length === 0} />
                    <InsightSection title="Low" insights={lowInsights} defaultExpanded={false} />
                  </>
                )}
              </div>

              {/* Workspace intelligence column */}
              {data && data.workspace_insights.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.12em]">Workspace Intelligence</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="space-y-2">
                    {data.workspace_insights
                      .sort((a, b) => b.pressure.score - a.pressure.score)
                      .map(ws => (
                        <WorkspaceCard key={ws.project_id} ws={ws} />
                      ))}
                  </div>

                  {/* Generation time */}
                  {data.generated_at && (
                    <p className="text-[7.5px] text-gray-300 text-center mt-4 font-mono">
                      Generated {new Date(data.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' · '}deterministic only, no AI inference
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
