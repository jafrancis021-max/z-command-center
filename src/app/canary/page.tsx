'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CanaryConfig {
  max_bet_usd:          number
  daily_loss_limit_usd: number
  max_open_positions:   number
  min_pm_liquidity:     number
  max_slippage_bps:     number
  require_confidence:   number
}

interface AuditRow {
  id:               string
  created_at:       string
  market_question:  string | null
  fixture_id:       string | null
  side:             string | null
  intended_price:   number | null
  size_usd:         number
  confidence:       number | null
  edge:             number | null
  execution_status: string
  reject_reason:    string | null
  slippage_bps:     number | null
  latency_ms:       number | null
  pnl_realized:     number | null
}

interface CanaryData {
  canary_enabled:   boolean
  config:           CanaryConfig
  daily_pnl:        number
  open_positions:   number
  evaluated_today:  number
  rejected_today:   number
  filled_today:     number
  submitted_today:  number
  avg_slippage_bps: number | null
  avg_latency_ms:   number | null
  last_execution:   { market_question: string | null; at: string; status: string } | null
  recent_audit:     AuditRow[]
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  candidate:        'text-[#737373]',
  gate_rejected:    'text-red-400',
  submitted:        'text-[#f59e0b]',
  filled:           'text-[#22c55e]',
  partially_filled: 'text-[#22c55e]/70',
  failed:           'text-red-500',
  expired:          'text-[#525252]',
}

const STATUS_DOT: Record<string, string> = {
  candidate:        'bg-[#737373]',
  gate_rejected:    'bg-red-400',
  submitted:        'bg-[#f59e0b] animate-pulse',
  filled:           'bg-[#22c55e]',
  partially_filled: 'bg-[#22c55e]/70',
  failed:           'bg-red-500',
  expired:          'bg-[#525252]',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins   = Math.floor(diffMs / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n.toFixed(2)}`
}

// ── Metric card ───────────────────────────────────────────────────────────────

function Metric({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3">
      <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${warn ? 'text-red-400' : 'text-[#e5e5e5]'}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CanaryPage() {
  const [data, setData]     = useState<CanaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sportspulse-canary')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as CanaryData)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-sm text-[#525252]">Loading canary…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-2">{error ?? 'No data'}</p>
          <button onClick={load} className="text-xs text-[#525252] hover:text-[#a3a3a3]">Retry</button>
        </div>
      </div>
    )
  }

  const pnlPositive = data.daily_pnl >= 0

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-semibold text-[#e5e5e5]">Canary Execution</h1>
            <p className="text-[10px] text-[#3a3a3a]">Experimental Infrastructure Validation Mode</p>
          </div>
          {/* Canary status badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium ${
            data.canary_enabled
              ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]'
              : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#525252]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${data.canary_enabled ? 'bg-[#f59e0b] animate-pulse' : 'bg-[#3a3a3a]'}`} />
            CANARY {data.canary_enabled ? 'ON' : 'OFF'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#3a3a3a]">
            {lastRefresh ? `Updated ${relativeTime(lastRefresh.toISOString())}` : ''}
          </span>
          <button
            onClick={load}
            className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
            title="Refresh"
          >
            ↺ Refresh
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-8">

        {/* Infrastructure validation warning */}
        <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-[#f59e0b] text-sm shrink-0">⚠</span>
          <div>
            <p className="text-xs font-medium text-[#f59e0b]">Experimental Infrastructure Validation Mode</p>
            <p className="text-[10px] text-[#737373] mt-0.5">
              NOT production betting. Max $5 · 1 position · No auto-scaling · Full audit trail.
              Do not loosen gates to create activity. Do not optimise for PnL.
            </p>
          </div>
        </div>

        {/* Metrics grid */}
        <section>
          <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-4">Today</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric
              label="Daily PnL"
              value={fmtPnl(data.daily_pnl)}
              sub={`limit: -$${data.config.daily_loss_limit_usd}`}
              warn={data.daily_pnl < 0}
            />
            <Metric
              label="Open Positions"
              value={String(data.open_positions)}
              sub={`max: ${data.config.max_open_positions}`}
              warn={data.open_positions >= data.config.max_open_positions}
            />
            <Metric
              label="Evaluated"
              value={String(data.evaluated_today)}
              sub={`${data.rejected_today} rejected · ${data.filled_today} filled`}
            />
            <Metric
              label="Submitted Today"
              value={String(data.submitted_today)}
              sub={`$${data.config.max_bet_usd} max per trade`}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <Metric
              label="Avg Slippage"
              value={data.avg_slippage_bps !== null ? `${data.avg_slippage_bps} bps` : '—'}
              sub={`max: ${data.config.max_slippage_bps} bps`}
              warn={data.avg_slippage_bps !== null && data.avg_slippage_bps > data.config.max_slippage_bps}
            />
            <Metric
              label="Avg Latency"
              value={data.avg_latency_ms !== null ? `${data.avg_latency_ms}ms` : '—'}
            />
            <Metric
              label="Last Execution"
              value={data.last_execution ? relativeTime(data.last_execution.at) : '—'}
              sub={data.last_execution?.market_question?.slice(0, 30) ?? undefined}
            />
          </div>
        </section>

        {/* Config panel */}
        <section>
          <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-4">Gate Config</h2>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {[
              ['Max bet',        `$${data.config.max_bet_usd}`,          'Hard cap: $5'],
              ['Daily limit',    `-$${data.config.daily_loss_limit_usd}`, ''],
              ['Max positions',  String(data.config.max_open_positions), ''],
              ['Min liquidity',  `$${data.config.min_pm_liquidity}`,     ''],
              ['Max slippage',   `${data.config.max_slippage_bps} bps`,  ''],
              ['Min confidence', String(data.config.require_confidence),  'trust_score'],
            ].map(([label, val, hint]) => (
              <div key={label}>
                <p className="text-[10px] text-[#525252]">{label}</p>
                <p className="text-sm font-medium text-[#e5e5e5] tabular-nums">{val}</p>
                {hint && <p className="text-[9px] text-[#3a3a3a]">{hint}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Recent audit log */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider">Audit Log</h2>
            <span className="text-[10px] text-[#3a3a3a]">Last 30 rows · append-only</span>
          </div>

          <div className="space-y-1.5">
            {data.recent_audit.map(row => (
              <div
                key={row.id}
                className="bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap text-xs"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[row.execution_status] ?? 'bg-[#525252]'}`} />

                {/* Fixture */}
                <span className="text-[#a3a3a3] flex-1 min-w-0 truncate" title={row.market_question ?? ''}>
                  {row.market_question?.slice(0, 44) ?? row.fixture_id ?? '—'}
                </span>

                {/* Side + price */}
                {row.side && (
                  <span className={`shrink-0 font-medium ${row.side === 'YES' ? 'text-[#22c55e]' : 'text-red-400'}`}>
                    {row.side}
                  </span>
                )}
                {row.intended_price !== null && (
                  <span className="text-[#525252] shrink-0">
                    @ {Number(row.intended_price).toFixed(3)}
                  </span>
                )}

                {/* Confidence + edge */}
                {row.confidence !== null && (
                  <span className="text-[#525252] shrink-0">
                    conf={Math.round(Number(row.confidence))}
                  </span>
                )}
                {row.edge !== null && (
                  <span className="text-[#525252] shrink-0">
                    edge={Math.round(Number(row.edge) * 100)}pp
                  </span>
                )}

                {/* Status */}
                <span className={`shrink-0 font-medium ${STATUS_COLOR[row.execution_status] ?? 'text-[#525252]'}`}>
                  {row.execution_status.replace(/_/g, ' ')}
                </span>

                {/* Reject reason */}
                {row.reject_reason && (
                  <span className="text-[#525252] shrink-0 text-[10px]">
                    ({row.reject_reason})
                  </span>
                )}

                {/* Slippage */}
                {row.slippage_bps !== null && (
                  <span className="text-[#525252] shrink-0 text-[10px]">
                    slip={row.slippage_bps}bps
                  </span>
                )}

                {/* PnL */}
                {row.pnl_realized !== null && (
                  <span className={`shrink-0 font-medium ${Number(row.pnl_realized) >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
                    {fmtPnl(Number(row.pnl_realized))}
                  </span>
                )}

                {/* Timestamp */}
                <span className="text-[#3a3a3a] shrink-0 text-[10px]">
                  {relativeTime(row.created_at)}
                </span>
              </div>
            ))}

            {data.recent_audit.length === 0 && (
              <div className="text-center py-10 text-[#525252]">
                <p className="text-sm">No audit rows yet.</p>
                <p className="text-[10px] mt-1">Run <code className="text-[#737373]">npx tsx src/jobs/runSportspulseCanaryExecution.ts</code> in einstein-marketing.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
