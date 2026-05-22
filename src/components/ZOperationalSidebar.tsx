'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PRESSURE_CFG, calculatePressure } from '@/lib/operational-pressure'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SidebarData {
  runtime: {
    status: 'healthy' | 'degraded' | 'error'
    active_jobs: number
    recent_failures: number
    last_success_at: string | null
  }
  inbox: {
    uncategorised_count: number
    latest_email_at: string | null
  }
  approvals: {
    pending_count: number
    stale_count: number
  }
  blockers: {
    open_count: number
    critical_count: number
  }
  suggestions: {
    pending_count: number
  }
  chains: {
    waiting_count: number
  }
  memories: {
    active_count: number
  }
  notifications: {
    unread_count: number
  }
  feed: Array<{
    id: string
    event_type: string
    title: string
    severity: string
    created_at: string
  }>
  focus: {
    title: string
    reason: string
    action_url: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(Math.abs(diff) / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const RUNTIME_CFG = {
  healthy:  { dot: 'bg-[#10B981]',              text: 'text-[#059669]',  label: 'Healthy'  },
  degraded: { dot: 'bg-[#F59E0B] animate-pulse', text: 'text-[#D97706]', label: 'Degraded' },
  error:    { dot: 'bg-red-500 animate-pulse',   text: 'text-red-600',   label: 'Error'    },
}

const SEVERITY_CFG: Record<string, { barColor: string; text: string; icon: string }> = {
  info:     { barColor: 'bg-gray-200',    text: 'text-gray-400',    icon: '·' },
  success:  { barColor: 'bg-[#10B981]',  text: 'text-[#059669]',  icon: '✓' },
  warning:  { barColor: 'bg-[#F59E0B]',  text: 'text-[#D97706]',  icon: '⚠' },
  critical: { barColor: 'bg-red-500',    text: 'text-red-600',    icon: '✗' },
}

const CATEGORY_ABBR: Record<string, string> = {
  workflow:     'WF',
  approval:     'AP',
  memory:       'MEM',
  blocker:      'BLK',
  inbox:        'IN',
  chain:        'CH',
  browser:      'EX',
  notification: 'NT',
}

function eventCategory(type: string): string {
  const t = type.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_ABBR)) {
    if (t.includes(k)) return v
  }
  return 'SYS'
}

// ── Counter tile ──────────────────────────────────────────────────────────────

function CounterTile({
  href, value, label, sub, valueColor,
}: {
  href: string
  value: number
  label: string
  sub?: string
  valueColor: string
}) {
  return (
    <Link
      href={href}
      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 flex flex-col gap-0.5 hover:border-gray-300 hover:bg-white transition-all group"
    >
      <span className={`text-[22px] font-bold leading-none tabular-nums ${valueColor}`}>{value}</span>
      <span className="text-[8px] text-gray-500 group-hover:text-gray-600 transition-colors leading-tight mt-1">{label}</span>
      {sub && <span className="text-[7px] text-gray-400 leading-none mt-0.5">{sub}</span>}
    </Link>
  )
}

// ── Row link ──────────────────────────────────────────────────────────────────

function RowLink({
  href, label, value, valueColor = 'text-[#D97706]', borderColor = 'border-gray-200',
}: {
  href: string
  label: string
  value: string | number
  valueColor?: string
  borderColor?: string
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between bg-gray-50 border ${borderColor} rounded-xl px-2.5 py-1.5 hover:bg-white transition-colors`}
    >
      <span className="text-[9.5px] text-gray-500">{label}</span>
      <span className={`text-[10.5px] font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </Link>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[7.5px] text-gray-400 uppercase tracking-[0.12em] font-semibold shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ data, lastRefresh, onRefresh, refreshing, sysStatus, sysCheckedAt }: {
  data: SidebarData
  lastRefresh: Date
  onRefresh: () => void
  refreshing: boolean
  sysStatus: SysProofStatus
  sysCheckedAt: string | null
}) {
  const rt    = RUNTIME_CFG[data.runtime.status]
  const focus = data.focus

  const pressure = calculatePressure({
    staleApprovals:        data.approvals.stale_count,
    pendingApprovals:      data.approvals.pending_count,
    criticalBlockers:      data.blockers.critical_count,
    openBlockers:          data.blockers.open_count,
    failedWorkflows24h:    data.runtime.recent_failures,
    stuckJobs:             0,
    failedExecutions24h:   0,
    criticalNotifications: data.notifications.unread_count,
    inboxBacklog:          data.suggestions.pending_count,
  })
  const pcfg = PRESSURE_CFG[pressure.level]

  const focusBg =
    focus.title === 'Runtime issue'       ? 'border-red-200 bg-red-50' :
    focus.title === 'Stale approvals'     ? 'border-amber-200 bg-amber-50' :
    focus.title === 'Critical blockers'   ? 'border-red-200 bg-red-50' :
    focus.title === 'Inbox triage needed' ? 'border-blue-200 bg-blue-50' :
    focus.title === 'All clear'           ? 'border-green-200 bg-green-50' :
                                            'border-gray-200 bg-gray-50'

  const focusTextColor =
    focus.title === 'Runtime issue'       ? 'text-red-600' :
    focus.title === 'Stale approvals'     ? 'text-amber-700' :
    focus.title === 'Critical blockers'   ? 'text-red-600' :
    focus.title === 'Inbox triage needed' ? 'text-blue-700' :
    focus.title === 'All clear'           ? 'text-green-700' :
                                            'text-gray-700'

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 h-14 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex items-center justify-center w-2.5 h-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-20 animate-ping ${rt.dot.split(' ')[0]}`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${rt.dot.split(' ')[0]}`} />
          </span>
          <span className="text-[10px] font-semibold text-gray-700">Z Runtime</span>
          <span className={`text-[7.5px] font-medium ${rt.text}`}>{rt.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7.5px] text-gray-400 tabular-nums">{lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button
            onClick={onRefresh}
            title="Refresh"
            className={`text-gray-300 hover:text-gray-500 transition-colors text-sm leading-none ${refreshing ? 'animate-spin' : ''}`}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3 grow">

        {/* Pressure indicator */}
        <Link
          href="/insights"
          className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-all hover:opacity-90 ${pcfg.bg} ${pcfg.border}`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pcfg.dot} ${pressure.level === 'high' || pressure.level === 'elevated' ? 'animate-pulse' : ''}`} />
            <span className="text-[8px] text-gray-400 uppercase tracking-[0.1em]">Pressure</span>
            <span className={`text-[9px] font-semibold ${pcfg.color}`}>{pcfg.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold tabular-nums ${pcfg.color}`}>{pressure.score}</span>
            <span className="text-[7.5px] text-gray-300">→</span>
          </div>
        </Link>

        {/* System health badge */}
        {(() => {
          const scfg = SYS_PROOF_CFG[sysStatus]
          return (
            <Link
              href="/system-proof"
              className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 hover:border-gray-300 hover:bg-white transition-all"
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${scfg.dot}`} />
                <span className="text-[8px] text-gray-400 uppercase tracking-[0.1em]">Infra</span>
                <span className={`text-[9px] font-semibold ${scfg.text}`}>{scfg.label}</span>
              </div>
              <span className="text-[7.5px] text-gray-400 font-mono">
                {sysCheckedAt ? new Date(sysCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </Link>
          )
        })()}

        {/* Focus block */}
        <Link
          href={focus.action_url}
          className={`block rounded-xl border px-3 py-2 transition-opacity hover:opacity-90 ${focusBg}`}
        >
          <p className="text-[7.5px] font-semibold text-gray-400 uppercase tracking-[0.12em] mb-0.5">Focus</p>
          <p className={`text-[11px] font-semibold leading-snug ${focusTextColor}`}>{focus.title}</p>
          <p className="text-[8.5px] text-gray-500 mt-0.5 leading-snug">{focus.reason}</p>
        </Link>

        {/* Runtime status */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <SectionDivider label="Scheduled Jobs" />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[9.5px] font-medium ${rt.text}`}>{data.runtime.active_jobs} active</span>
            {data.runtime.recent_failures > 0 ? (
              <span className="text-[8.5px] text-red-600">⚠ {data.runtime.recent_failures} failed</span>
            ) : (
              <span className="text-[8.5px] text-gray-400">no failures</span>
            )}
          </div>
          <p className="text-[7.5px] text-gray-400 mt-0.5">Success: {relativeTime(data.runtime.last_success_at)}</p>
        </div>

        {/* Counter grid — 2-col */}
        <div className="grid grid-cols-2 gap-1.5">
          <CounterTile
            href="/approvals"
            value={data.approvals.pending_count}
            label="Approvals"
            sub={data.approvals.stale_count > 0 ? `${data.approvals.stale_count} stale` : undefined}
            valueColor={data.approvals.stale_count > 0 ? 'text-[#D97706]' : data.approvals.pending_count > 0 ? 'text-gray-800' : 'text-gray-200'}
          />
          <CounterTile
            href="/dashboard"
            value={data.blockers.open_count}
            label="Blockers"
            sub={data.blockers.critical_count > 0 ? `${data.blockers.critical_count} crit` : undefined}
            valueColor={data.blockers.critical_count > 0 ? 'text-red-600' : data.blockers.open_count > 0 ? 'text-gray-800' : 'text-gray-200'}
          />
          <CounterTile
            href="/inbox"
            value={data.inbox.uncategorised_count}
            label="Inbox"
            sub={data.inbox.latest_email_at ? relativeTime(data.inbox.latest_email_at) : undefined}
            valueColor={data.inbox.uncategorised_count > 0 ? 'text-[#D97706]' : 'text-gray-200'}
          />
          <CounterTile
            href="/memory"
            value={data.memories.active_count}
            label="Memories"
            valueColor={data.memories.active_count > 0 ? 'text-violet-600' : 'text-gray-200'}
          />
        </div>

        {/* Conditional rows */}
        {(data.suggestions.pending_count > 0 || data.chains.waiting_count > 0) && (
          <div className="space-y-1">
            {data.suggestions.pending_count > 0 && (
              <RowLink href="/inbox#workflow-suggestions" label="Workflow suggestions" value={data.suggestions.pending_count} />
            )}
            {data.chains.waiting_count > 0 && (
              <RowLink href="/workflows#chain-runs" label="Chains waiting" value={data.chains.waiting_count} valueColor="text-blue-600" borderColor="border-blue-200" />
            )}
          </div>
        )}

        {/* Unread alerts */}
        {data.notifications.unread_count > 0 && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9.5px] text-gray-600">Unread alerts</span>
            </div>
            <span className="text-[10.5px] font-semibold text-red-600 tabular-nums">{data.notifications.unread_count}</span>
          </div>
        )}

        {/* Recent events */}
        <div>
          <SectionDivider label="Recent Events" />
          <div className="space-y-px mt-1">
            {data.feed.length === 0 ? (
              <p className="text-[8.5px] text-gray-300 text-center py-2.5">No recent events</p>
            ) : (
              data.feed.map(event => {
                const cfg = SEVERITY_CFG[event.severity] ?? SEVERITY_CFG.info
                const abbr = eventCategory(event.event_type)
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 hover:border-gray-300 transition-colors"
                  >
                    <div className={`w-[2px] self-stretch rounded-full shrink-0 ${cfg.barColor} opacity-70`} />

                    <span className="text-[7px] text-gray-400 font-mono font-bold shrink-0 w-7">{abbr}</span>

                    <p className="text-[8.5px] text-gray-600 truncate flex-1 leading-snug">{event.title}</p>

                    <span className="text-[7px] text-gray-400 tabular-nums font-mono shrink-0">
                      {relativeTime(event.created_at)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 animate-pulse">
      <div className="h-12 bg-gray-100 rounded-xl" />
      <div className="h-10 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-7 bg-gray-100 rounded-xl" />
      <div className="space-y-px">
        {[0, 1, 2, 4].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg" />)}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

type SysProofStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

const SYS_PROOF_CFG: Record<SysProofStatus, { dot: string; text: string; label: string }> = {
  healthy:  { dot: 'bg-[#10B981]',              text: 'text-[#059669]', label: 'Healthy'  },
  degraded: { dot: 'bg-[#F59E0B] animate-pulse', text: 'text-[#D97706]', label: 'Degraded' },
  critical: { dot: 'bg-red-500 animate-pulse',   text: 'text-red-600',   label: 'Critical'  },
  unknown:  { dot: 'bg-gray-300',               text: 'text-gray-400',  label: 'No data'   },
}

export default function ZOperationalSidebar() {
  const [data, setData]               = useState<SidebarData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [refreshing, setRefreshing]   = useState(false)
  const [open, setOpen]               = useState(false)
  const [sysStatus, setSysStatus]     = useState<SysProofStatus>('unknown')
  const [sysCheckedAt, setSysCheckedAt] = useState<string | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const res  = await fetch('/api/operational-sidebar')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load sidebar')
      setData(json as SidebarData)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadSysProof = useCallback(async () => {
    try {
      const res = await fetch('/api/system-proof/status')
      if (!res.ok) return
      const json = await res.json() as { last_run: { overall_status: string; checked_at: string } | null }
      if (json.last_run) {
        setSysStatus(json.last_run.overall_status as SysProofStatus)
        setSysCheckedAt(json.last_run.checked_at)
      }
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    void load()
    void loadSysProof()
    const t  = setInterval(() => void load(), 30_000)
    const ts = setInterval(() => void loadSysProof(), 120_000)
    return () => { clearInterval(t); clearInterval(ts) }
  }, [load, loadSysProof])

  const panelContent = (
    <div className="flex flex-col h-full border-l border-gray-200 bg-white">
      {loading && !data ? (
        <>
          <div className="flex items-center justify-between px-3.5 h-14 border-b border-gray-200">
            <div className="w-20 h-2.5 bg-gray-100 rounded animate-pulse" />
            <div className="w-10 h-2 bg-gray-100 rounded animate-pulse" />
          </div>
          <SidebarSkeleton />
        </>
      ) : error ? (
        <>
          <div className="flex items-center px-3.5 h-14 border-b border-gray-200">
            <span className="text-[10px] font-semibold text-gray-700">Z Runtime</span>
          </div>
          <div className="p-3">
            <p className="text-[8.5px] text-red-600 text-center">⚠ {error}</p>
          </div>
        </>
      ) : data ? (
        <SidebarContent
          data={data}
          lastRefresh={lastRefresh}
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          sysStatus={sysStatus}
          sysCheckedAt={sysCheckedAt}
        />
      ) : null}
    </div>
  )

  return (
    <>
      {/* Desktop: fixed right sidebar */}
      <div className="hidden lg:block fixed right-0 top-0 w-[272px] h-screen z-20 overflow-hidden">
        {panelContent}
      </div>

      {/* Mobile: floating button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-30 w-10 h-10 rounded-xl bg-white border border-gray-200 text-[#10B981] font-bold text-sm flex items-center justify-center shadow-lg"
        aria-label="Open Z Runtime"
      >
        Z
      </button>

      {/* Mobile: overlay panel */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            className="flex-1 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          />
          <div className="w-72 h-full overflow-hidden relative">
            {panelContent}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 left-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}
