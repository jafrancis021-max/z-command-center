'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckCategory = 'database' | 'runtime' | 'execution' | 'intelligence' | 'comms'
type CheckStatus   = 'pass' | 'warning' | 'fail'
type OverallStatus = 'healthy' | 'degraded' | 'critical'

interface ProofCheck {
  name:       string
  category:   CheckCategory
  status:     CheckStatus
  message:    string
  evidence:   string
  latency_ms: number
  checked_at: string
}

interface ProofResult {
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

interface RunHistory {
  id:             string
  overall_status: string
  checked_at:     string
  duration_ms:    number
  pass_count:     number
  warning_count:  number
  fail_count:     number
  total_count:    number
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<OverallStatus, { dot: string; text: string; bg: string; border: string; label: string }> = {
  healthy:  { dot: 'bg-[#10B981]',             text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  label: 'Healthy'  },
  degraded: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Degraded' },
  critical: { dot: 'bg-red-500 animate-pulse',   text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Critical'  },
}

const CHECK_STATUS_CFG: Record<CheckStatus, { dot: string; text: string; rowBg: string }> = {
  pass:    { dot: 'bg-[#10B981]', text: 'text-green-700',  rowBg: 'hover:bg-gray-50'       },
  warning: { dot: 'bg-amber-400', text: 'text-amber-700',  rowBg: 'hover:bg-amber-50/50'   },
  fail:    { dot: 'bg-red-500',   text: 'text-red-700',    rowBg: 'hover:bg-red-50/50'     },
}

const CATEGORY_LABELS: Record<CheckCategory, string> = {
  database:     'Database',
  runtime:      'Runtime',
  execution:    'Execution',
  intelligence: 'Intelligence',
  comms:        'Comms',
}

const CATEGORY_ORDER: CheckCategory[] = ['database', 'runtime', 'execution', 'intelligence', 'comms']

// ── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: ProofCheck }) {
  const [expanded, setExpanded] = useState(check.status !== 'pass')
  const cfg = CHECK_STATUS_CFG[check.status]

  return (
    <button
      onClick={() => setExpanded(v => !v)}
      className={`w-full text-left px-4 py-2.5 border-b border-gray-100 last:border-0 transition-colors ${cfg.rowBg}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-[9px] font-mono text-gray-500 shrink-0 w-44 truncate text-left">{check.name}</span>
        <span className="flex-1 text-[9.5px] text-gray-500 truncate text-left">{check.message}</span>
        <span className="shrink-0 text-[7.5px] font-mono text-gray-400 tabular-nums">{check.latency_ms}ms</span>
        <span className={`shrink-0 text-[8px] ${expanded ? 'rotate-90' : ''} text-gray-400 transition-transform`}>›</span>
      </div>
      {expanded && (
        <div className="mt-2 ml-5 pl-3 border-l border-gray-200">
          <p className="text-[8px] font-mono text-gray-500 leading-relaxed">{check.evidence}</p>
          <p className="text-[7.5px] text-gray-300 mt-1 font-mono">
            {new Date(check.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      )}
    </button>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ category, checks }: { category: CheckCategory; checks: ProofCheck[] }) {
  const fails    = checks.filter(c => c.status === 'fail').length
  const warnings = checks.filter(c => c.status === 'warning').length
  const allPass  = fails === 0 && warnings === 0
  const [open, setOpen] = useState(!allPass)

  const dotColor = fails > 0 ? 'bg-red-500' : warnings > 0 ? 'bg-amber-400' : 'bg-[#10B981]'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${!allPass ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.09em]">
            {CATEGORY_LABELS[category]}
          </span>
          <span className="text-[8px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full tabular-nums">
            {checks.length}
          </span>
          {fails > 0 && (
            <span className="text-[7.5px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">{fails} fail</span>
          )}
          {warnings > 0 && (
            <span className="text-[7.5px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">{warnings} warn</span>
          )}
        </div>
        <span className={`text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {checks.map(check => (
            <CheckRow key={check.name} check={check} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ run, last }: { run: RunHistory; last: boolean }) {
  const st = run.overall_status as OverallStatus
  const cfg = STATUS_CFG[st] ?? STATUS_CFG.degraded
  return (
    <div className={`flex items-center gap-3 px-4 py-2 ${!last ? 'border-b border-gray-100' : ''} hover:bg-gray-50 transition-colors`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot.replace(' animate-pulse', '')}`} />
      <span className={`text-[8.5px] font-semibold ${cfg.text} w-16 shrink-0`}>{cfg.label}</span>
      <span className="text-[8px] text-gray-500 flex-1">{run.pass_count} pass · {run.warning_count} warn · {run.fail_count} fail</span>
      <span className="text-[7.5px] text-gray-400 tabular-nums font-mono shrink-0">{run.duration_ms}ms</span>
      <span className="text-[7.5px] text-gray-300 tabular-nums shrink-0">
        {new Date(run.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemProofPage() {
  const [result,   setResult]   = useState<ProofResult | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [running,  setRunning]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [history,  setHistory]  = useState<RunHistory[]>([])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/system-proof/status')
      if (res.ok) {
        const json = await res.json() as { history: RunHistory[] }
        setHistory(json.history ?? [])
      }
    } catch { /* non-fatal */ }
  }, [])

  const runProof = useCallback(async (persist = false) => {
    if (persist) setRunning(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/system-proof${persist ? '?persist=true' : ''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as ProofResult
      setResult(json)
      if (persist) void fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run proof')
    } finally {
      setLoading(false)
      setRunning(false)
    }
  }, [fetchHistory])

  useEffect(() => {
    void runProof(false)
    void fetchHistory()
  }, [runProof, fetchHistory])

  const overallCfg = result ? (STATUS_CFG[result.overall_status] ?? STATUS_CFG.degraded) : null

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className={`absolute inline-flex h-full w-full rounded-full ${overallCfg?.dot.replace(' animate-pulse', '') ?? 'bg-gray-400'} opacity-20 animate-ping`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${overallCfg?.dot.replace(' animate-pulse', '') ?? 'bg-gray-400'}`} />
          </span>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">System Proof</p>
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        {result && (
          <div className={`flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-xl border ${overallCfg?.bg} ${overallCfg?.border}`}>
            <span className={`w-1 h-1 rounded-full shrink-0 ${overallCfg?.dot}`} />
            <span className={overallCfg?.text}>{overallCfg?.label}</span>
            <span className="text-gray-300 ml-1">·</span>
            <span className="text-gray-500">{result.summary.pass}/{result.summary.total} pass</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {result && (
            <span className="text-[8px] text-gray-400 font-mono">
              {result.duration_ms}ms · {new Date(result.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void runProof(true)}
            disabled={loading || running}
            className="flex items-center gap-1.5 text-[9px] text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            <span className={`text-[10px] ${running ? 'animate-spin' : ''}`}>↺</span>
            {running ? 'Running…' : 'Re-run & Save'}
          </button>
          <Link href="/dashboard" className="text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1000px] mx-auto space-y-5">

        {/* ── Error ───────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            {error}
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────── */}
        {loading && !result && (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 bg-white border border-gray-200 rounded-2xl" />
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-gray-100 border border-gray-200 rounded-2xl" />
            ))}
          </div>
        )}

        {result && (
          <>
            {/* ── Summary strip ─────────────────────────────────────── */}
            <div className={`flex items-stretch bg-white rounded-2xl border overflow-hidden shadow-sm ${overallCfg?.border}`}>
              {[
                { label: 'Total checks',  value: result.summary.total,   color: 'text-gray-400'    },
                { label: 'Passed',        value: result.summary.pass,    color: 'text-[#10B981]'   },
                { label: 'Warnings',      value: result.summary.warning, color: result.summary.warning > 0 ? 'text-amber-600' : 'text-gray-200' },
                { label: 'Failures',      value: result.summary.fail,    color: result.summary.fail > 0    ? 'text-red-600'   : 'text-gray-200' },
              ].map((s, i) => (
                <div key={s.label} className={`flex flex-col gap-1.5 px-5 py-4 flex-1 ${i < 3 ? 'border-r border-gray-200' : ''}`}>
                  <p className={`text-[28px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-gray-400 font-medium tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>

            {/* ── Checks by category ────────────────────────────────── */}
            <div className="space-y-3">
              {CATEGORY_ORDER.map(cat => {
                const catChecks = result.checks.filter(c => c.category === cat)
                if (catChecks.length === 0) return null
                return <CategorySection key={cat} category={cat} checks={catChecks} />
              })}
            </div>
          </>
        )}

        {/* ── Persistent history ────────────────────────────────────── */}
        {history.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Scan History</h2>
              <p className="text-[9px] text-gray-400">{history.length} saved run{history.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {history.map((run, i) => (
                <HistoryRow key={run.id} run={run} last={i === history.length - 1} />
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center py-4">
          <p className="text-[8px] text-gray-300">
            18 deterministic checks · read-only · no inference
          </p>
        </div>

      </main>
    </div>
  )
}
