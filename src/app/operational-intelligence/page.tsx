'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type {
  CasePressureResult, StalledCase, WorkflowDegradation, Hotspot,
} from '@/lib/operational-intelligence-engine'

// ── API response type ─────────────────────────────────────────────────────────

interface ActiveInsight {
  id:                  string
  insight_type:        string
  severity:            string
  confidence:          number
  area:                string
  title:               string
  description:         string
  why_it_matters:      string
  recommendation:      string
  evidence:            string | null
  related_case_id:     string | null
  created_at:          string
  metadata:            Record<string, unknown>
}

interface IntelligenceSummary {
  total_insights:       number
  critical:             number
  high:                 number
  medium:               number
  stalled_cases:        number
  degraded_workflows:   number
  critical_cases:       number
  elevated_cases:       number
}

interface IntelligenceData {
  generated_at:         string
  duration_ms:          number
  cases_analyzed:       number
  case_pressures:       CasePressureResult[]
  stalled_cases:        StalledCase[]
  workflow_degradation: WorkflowDegradation[]
  active_insights:      ActiveInsight[]
  hotspots:             Hotspot[]
  summary:              IntelligenceSummary
}

// ── Config ────────────────────────────────────────────────────────────────────

const PRESSURE_CFG: Record<string, { color: string; bg: string; border: string; bar: string; label: string }> = {
  critical: { color: 'text-red-400',   bg: 'bg-red-500/[0.06]',       border: 'border-red-500/15',       bar: 'bg-red-500',    label: 'Critical' },
  elevated: { color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/[0.06]',     border: 'border-[#f59e0b]/15',     bar: 'bg-[#f59e0b]',  label: 'Elevated' },
  moderate: { color: 'text-[#a0a0a0]', bg: 'bg-[#141414]',            border: 'border-[#222]',           bar: 'bg-[#666]',     label: 'Moderate' },
  low:      { color: 'text-[#22c55e]', bg: 'bg-[#22c55e]/[0.04]',     border: 'border-[#22c55e]/10',     bar: 'bg-[#22c55e]',  label: 'Low'      },
}

const SEVERITY_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  critical: { color: 'text-red-400',   bg: 'bg-red-500/[0.06]',   border: 'border-red-500/15',   dot: 'bg-red-500 animate-pulse' },
  high:     { color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/[0.06]', border: 'border-[#f59e0b]/15', dot: 'bg-[#f59e0b]'            },
  medium:   { color: 'text-[#888]',    bg: 'bg-[#111]',           border: 'border-[#1e1e1e]',    dot: 'bg-[#555]'               },
  low:      { color: 'text-[#555]',    bg: 'bg-[#0d0d0d]',        border: 'border-[#181818]',    dot: 'bg-[#2a2a2a]'           },
}

const WORKFLOW_HEALTH_CFG: Record<string, { color: string; dot: string; label: string }> = {
  critical: { color: 'text-red-400',   dot: 'bg-red-500 animate-pulse', label: 'Critical' },
  degraded: { color: 'text-[#f59e0b]', dot: 'bg-[#f59e0b]',             label: 'Degraded' },
  healthy:  { color: 'text-[#22c55e]', dot: 'bg-[#22c55e]',             label: 'Healthy'  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60_000)
  if (m < 1)    return 'just now'
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SectionHeader({ title, count, sub }: { title: string; count?: number; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-[10px] font-semibold text-[#606060] uppercase tracking-[0.1em]">{title}</h2>
      {count !== undefined && (
        <span className="text-[8px] text-[#505050] bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>
      )}
      {sub && <span className="text-[8.5px] text-[#333] ml-1">{sub}</span>}
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: ActiveInsight }) {
  const [expanded, setExpanded] = useState(false)
  const scfg = SEVERITY_CFG[insight.severity] ?? SEVERITY_CFG.medium

  return (
    <div className={`bg-[#0a0a0a] border ${scfg.border} rounded-xl overflow-hidden`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#0e0e0e] transition-colors"
      >
        <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${scfg.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-medium text-[#c0c0c0] leading-snug">{insight.title}</p>
          <p className="text-[8px] text-[#555] mt-0.5 truncate">{insight.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2 ml-2">
          <span className={`text-[7.5px] px-1.5 py-0.5 rounded border ${scfg.bg} ${scfg.border} ${scfg.color}`}>
            {insight.severity}
          </span>
          <span className="text-[7.5px] text-[#333] tabular-nums">{insight.confidence}%</span>
          <span className="text-[8px] text-[#333]">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#111] px-4 py-3 space-y-3">
          {insight.why_it_matters && (
            <div>
              <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Why it matters</p>
              <p className="text-[8.5px] text-[#777] leading-relaxed">{insight.why_it_matters}</p>
            </div>
          )}
          {insight.evidence && (
            <div>
              <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Evidence</p>
              <p className="text-[8px] text-[#666] font-mono leading-relaxed bg-[#0d0d0d] border border-[#181818] rounded-lg px-3 py-2">{insight.evidence}</p>
            </div>
          )}
          <div>
            <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Recommendation</p>
            <p className="text-[8.5px] text-[#22c55e]/80 leading-relaxed">{insight.recommendation}</p>
          </div>
          {insight.related_case_id && (
            <Link
              href={`/cases/${insight.related_case_id}`}
              className="inline-flex items-center gap-1 text-[7.5px] text-[#555] hover:text-[#888] transition-colors border border-[#1a1a1a] px-2 py-1 rounded-lg"
            >
              View case →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OperationalIntelligencePage() {
  const [data,    setData]    = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/operational-intelligence')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as IntelligenceData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <span className="text-[9px] text-[#333] animate-pulse">Running operational intelligence…</span>
    </div>
  )
  if (error) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <p className="text-[11px] text-red-400">{error}</p>
    </div>
  )
  if (!data) return null

  const { summary, case_pressures, stalled_cases, workflow_degradation, active_insights, hotspots } = data

  const criticalInsights   = active_insights.filter(i => i.severity === 'critical')
  const nonCritInsights    = active_insights.filter(i => i.severity !== 'critical')
  const hasAnything        = active_insights.length > 0 || stalled_cases.length > 0 || workflow_degradation.length > 0

  return (
    <div className="min-h-screen bg-[#080808]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-[#131313] bg-[#080808]/96 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          <p className="text-[10px] font-semibold text-[#a0a0a0] uppercase tracking-[0.1em]">Operational Intelligence</p>
        </div>
        <div className="w-px h-4 bg-[#1a1a1a]" />
        <span className="text-[8px] text-[#333] tabular-nums">{relTime(data.generated_at)} · {data.duration_ms}ms · {data.cases_analyzed} cases</span>
        <div className="ml-auto">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-[8px] text-[#444] hover:text-[#666] transition-colors disabled:opacity-30 border border-[#1e1e1e] px-2.5 py-1.5 rounded-lg"
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[960px] mx-auto space-y-6">

        {/* ── Summary strip ─────────────────────────────────────────── */}
        <div className="flex items-stretch bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden divide-x divide-[#181818]">
          {[
            { label: 'Insights',     value: summary.total_insights,     color: summary.total_insights > 0   ? 'text-[#c0c0c0]' : 'text-[#2a2a2a]' },
            { label: 'Critical',     value: summary.critical,           color: summary.critical > 0          ? 'text-red-400'   : 'text-[#2a2a2a]' },
            { label: 'High',         value: summary.high,               color: summary.high > 0              ? 'text-[#f59e0b]' : 'text-[#2a2a2a]' },
            { label: 'Stalled',      value: summary.stalled_cases,      color: summary.stalled_cases > 0     ? 'text-[#f59e0b]' : 'text-[#2a2a2a]' },
            { label: 'Degraded WF',  value: summary.degraded_workflows, color: summary.degraded_workflows > 0 ? 'text-red-400'  : 'text-[#2a2a2a]' },
            { label: 'Cases',        value: data.cases_analyzed,        color: 'text-[#555]' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-4 py-4 flex-1">
              <p className={`text-[22px] font-bold tabular-nums leading-none ${s.color}`}>{loading ? '–' : s.value}</p>
              <p className="text-[8.5px] text-[#5a5a5a] tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {!hasAnything && (
          <div className="text-center py-16 bg-[#0a0a0a] border border-[#151515] rounded-2xl">
            <p className="text-[11px] text-[#22c55e]">No operational issues detected.</p>
            <p className="text-[9px] text-[#333] mt-1.5">All cases are progressing, workflows are healthy, and no stalls detected.</p>
          </div>
        )}

        {/* ── Critical warnings ─────────────────────────────────────── */}
        {criticalInsights.length > 0 && (
          <section>
            <SectionHeader title="Critical Warnings" count={criticalInsights.length} />
            <div className="space-y-2">
              {criticalInsights.map(i => <InsightCard key={i.id} insight={i} />)}
            </div>
          </section>
        )}

        {/* ── Hotspots ──────────────────────────────────────────────── */}
        {hotspots.length > 0 && (
          <section>
            <SectionHeader title="Operational Hotspots" count={hotspots.length} sub="highest-pressure areas" />
            <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
              {hotspots.map((h, i) => {
                const cfg = PRESSURE_CFG[h.severity] ?? PRESSURE_CFG.moderate
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i < hotspots.length - 1 ? 'border-b border-[#131313]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.bar}`} />
                    <span className="flex-1 text-[9px] text-[#c0c0c0] truncate">{h.entity}</span>
                    <span className="text-[8px] text-[#666] truncate max-w-[280px]">{h.issue}</span>
                    <span className={`text-[7.5px] px-1.5 py-0.5 rounded border capitalize ${cfg.bg} ${cfg.border} ${cfg.color}`}>{h.severity}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Operational pressure map ───────────────────────────────── */}
        {case_pressures.length > 0 && (
          <section>
            <SectionHeader
              title="Operational Pressure Map"
              count={case_pressures.length}
              sub={`${case_pressures.filter(p => p.pressure_level === 'critical').length} critical · ${case_pressures.filter(p => p.pressure_level === 'elevated').length} elevated`}
            />
            <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
              {case_pressures.map((p, i) => {
                const cfg = PRESSURE_CFG[p.pressure_level] ?? PRESSURE_CFG.low
                return (
                  <Link
                    key={p.case_id}
                    href={`/cases/${p.case_id}`}
                    className={`flex items-center gap-3 px-4 py-2.5 ${i < case_pressures.length - 1 ? 'border-b border-[#0f0f0f]' : ''} hover:bg-[#0e0e0e] transition-colors group`}
                  >
                    {/* Pressure bar */}
                    <div className="w-16 h-1 bg-[#111] rounded-full shrink-0 overflow-hidden">
                      <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${p.pressure_score}%` }} />
                    </div>
                    <span className={`text-[8px] font-mono tabular-nums w-7 shrink-0 ${cfg.color}`}>{p.pressure_score}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9.5px] text-[#c0c0c0] truncate group-hover:text-white transition-colors">{p.case_title}</p>
                      <p className="text-[7.5px] text-[#444] truncate mt-0.5">{p.pressure_reason}</p>
                    </div>
                    <span className={`shrink-0 text-[7.5px] px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color} capitalize`}>{p.pressure_level}</span>
                    <span className="shrink-0 text-[7.5px] text-[#444] capitalize">{p.case_status.replace(/_/g, ' ')}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Stalled cases ─────────────────────────────────────────── */}
        {stalled_cases.length > 0 && (
          <section>
            <SectionHeader title="Stalled Cases" count={stalled_cases.length} sub="no linked activity in >48h" />
            <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
              {stalled_cases.map((sc, i) => (
                <Link
                  key={sc.case_id}
                  href={`/cases/${sc.case_id}`}
                  className={`flex items-center gap-3 px-4 py-2.5 ${i < stalled_cases.length - 1 ? 'border-b border-[#0f0f0f]' : ''} hover:bg-[#0e0e0e] transition-colors group`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#f59e0b]/50" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9.5px] text-[#c0c0c0] truncate group-hover:text-white transition-colors">{sc.case_title}</p>
                    <p className="text-[7.5px] text-[#444] mt-0.5">
                      {sc.last_activity ? `Last activity ${relTime(sc.last_activity)}` : 'No activity on record'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[7.5px] text-[#f59e0b] tabular-nums font-mono">{sc.stalled_hours}h stalled</span>
                  <span className="shrink-0 text-[7.5px] text-[#555] capitalize">{sc.case_status.replace(/_/g, ' ')}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Workflow health ────────────────────────────────────────── */}
        {workflow_degradation.length > 0 && (
          <section>
            <SectionHeader title="Workflow Health" count={workflow_degradation.length} sub="degraded or critical chains" />
            <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
              {workflow_degradation.map((wd, i) => {
                const hcfg = WORKFLOW_HEALTH_CFG[wd.health_status] ?? WORKFLOW_HEALTH_CFG.degraded
                return (
                  <div key={wd.workflow_chain_id} className={`flex items-center gap-3 px-4 py-2.5 ${i < workflow_degradation.length - 1 ? 'border-b border-[#0f0f0f]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hcfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9.5px] text-[#c0c0c0] truncate">{wd.workflow_name}</p>
                      <p className="text-[7.5px] text-[#444] truncate mt-0.5">{wd.reason}</p>
                    </div>
                    {wd.failure_count > 0 && (
                      <span className="shrink-0 text-[7.5px] text-red-400/70 tabular-nums">{wd.failure_count}× failed</span>
                    )}
                    {wd.related_case_ids.length > 0 && (
                      <span className="shrink-0 text-[7.5px] text-[#555]">{wd.related_case_ids.length} case{wd.related_case_ids.length !== 1 ? 's' : ''}</span>
                    )}
                    <span className={`shrink-0 text-[7.5px] ${hcfg.color}`}>{hcfg.label}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Active insights (non-critical) ────────────────────────── */}
        {nonCritInsights.length > 0 && (
          <section>
            <SectionHeader title="Active Insights" count={nonCritInsights.length} sub="high / medium priority" />
            <div className="space-y-2">
              {nonCritInsights.map(i => <InsightCard key={i.id} insight={i} />)}
            </div>
          </section>
        )}

        {/* ── Recommended actions ────────────────────────────────────── */}
        {active_insights.length > 0 && (
          <section>
            <SectionHeader title="Recommended Actions" />
            <div className="bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden">
              {active_insights
                .sort((a, b) => {
                  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
                  return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
                })
                .slice(0, 10)
                .map((ins, i, arr) => {
                  const scfg = SEVERITY_CFG[ins.severity] ?? SEVERITY_CFG.medium
                  return (
                    <div key={ins.id} className={`flex items-start gap-3 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-[#0f0f0f]' : ''}`}>
                      <span className={`mt-[5px] w-1 h-1 rounded-full shrink-0 ${scfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[8.5px] text-[#22c55e]/80 leading-relaxed">{ins.recommendation}</p>
                        <p className="text-[7.5px] text-[#3a3a3a] mt-0.5 truncate">{ins.title}</p>
                      </div>
                      {ins.related_case_id && (
                        <Link
                          href={`/cases/${ins.related_case_id}`}
                          className="shrink-0 text-[7px] text-[#444] hover:text-[#666] transition-colors border border-[#1a1a1a] px-1.5 py-0.5 rounded"
                        >
                          case →
                        </Link>
                      )}
                    </div>
                  )
                })}
            </div>
          </section>
        )}

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-[7.5px] text-[#1e1e1e] py-2">
          <span>Generated {relTime(data.generated_at)}</span>
          <span>{data.duration_ms}ms · {data.cases_analyzed} cases · deterministic analysis</span>
          <Link href="/cases" className="text-[#2a2a2a] hover:text-[#555] transition-colors">View cases →</Link>
        </div>

      </main>
    </div>
  )
}
