'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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
  healthy:  { dot: 'bg-[#22c55e]',              text: 'text-[#22c55e]',  label: 'Healthy'  },
  degraded: { dot: 'bg-[#f59e0b] animate-pulse', text: 'text-[#f59e0b]', label: 'Degraded' },
  error:    { dot: 'bg-red-500 animate-pulse',   text: 'text-red-400',   label: 'Error'    },
}

const SEVERITY_CFG: Record<string, { barColor: string; text: string; icon: string }> = {
  info:     { barColor: 'bg-[#1e1e1e]', text: 'text-[#4a4a4a]', icon: '·' },
  success:  { barColor: 'bg-[#22c55e]', text: 'text-[#22c55e]', icon: '✓' },
  warning:  { barColor: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', icon: '⚠' },
  critical: { barColor: 'bg-red-500',   text: 'text-red-400',   icon: '✗' },
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
      className="bg-[#0e0e0e] border border-[#1c1c1c] rounded-xl p-2 flex flex-col items-center gap-0.5 hover:border-[#282828] hover:bg-[#111] transition-all group"
    >
      <span className={`text-[17px] font-bold leading-none tabular-nums ${valueColor}`}>{value}</span>
      <span className="text-[7.5px] text-[#333] group-hover:text-[#555] transition-colors text-center leading-tight mt-0.5">{label}</span>
      {sub && <span className="text-[7px] text-[#252525] leading-none">{sub}</span>}
    </Link>
  )
}

// ── Row link ──────────────────────────────────────────────────────────────────

function RowLink({
  href, label, value, valueColor = 'text-[#f59e0b]', borderColor = 'border-[#1c1c1c]',
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
      className={`flex items-center justify-between bg-[#0e0e0e] border ${borderColor} rounded-xl px-2.5 py-1.5 hover:bg-[#121212] transition-colors`}
    >
      <span className="text-[9.5px] text-[#444]">{label}</span>
      <span className={`text-[10.5px] font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </Link>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[7.5px] text-[#1e1e1e] uppercase tracking-[0.12em] font-semibold shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[#141414]" />
    </div>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ data, lastRefresh, onRefresh, refreshing }: {
  data: SidebarData
  lastRefresh: Date
  onRefresh: () => void
  refreshing: boolean
}) {
  const rt    = RUNTIME_CFG[data.runtime.status]
  const focus = data.focus

  const focusBg =
    focus.title === 'Runtime issue'       ? 'border-red-500/20 bg-red-500/[0.03]' :
    focus.title === 'Stale approvals'     ? 'border-[#f59e0b]/20 bg-[#f59e0b]/[0.03]' :
    focus.title === 'Critical blockers'   ? 'border-red-500/20 bg-red-500/[0.03]' :
    focus.title === 'Inbox triage needed' ? 'border-blue-500/20 bg-blue-500/[0.03]' :
    focus.title === 'All clear'           ? 'border-[#22c55e]/20 bg-[#22c55e]/[0.03]' :
                                            'border-[#1c1c1c] bg-[#0e0e0e]'

  const focusTextColor =
    focus.title === 'Runtime issue'       ? 'text-red-400' :
    focus.title === 'Stale approvals'     ? 'text-[#f5a623]' :
    focus.title === 'Critical blockers'   ? 'text-red-400' :
    focus.title === 'Inbox triage needed' ? 'text-blue-400' :
    focus.title === 'All clear'           ? 'text-[#22c55e]' :
                                            'text-[#d4d4d4]'

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 h-14 border-b border-[#131313] shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex items-center justify-center w-2.5 h-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-20 animate-ping ${rt.dot.split(' ')[0]}`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${rt.dot.split(' ')[0]}`} />
          </span>
          <span className="text-[10px] font-semibold text-[#bbb]">Z Runtime</span>
          <span className={`text-[7.5px] font-medium ${rt.text}`}>{rt.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7.5px] text-[#252525] tabular-nums">{lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button
            onClick={onRefresh}
            title="Refresh"
            className={`text-[#2a2a2a] hover:text-[#555] transition-colors text-sm leading-none ${refreshing ? 'animate-spin' : ''}`}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3 grow">

        {/* Focus block */}
        <Link
          href={focus.action_url}
          className={`block rounded-xl border px-3 py-2 transition-opacity hover:opacity-90 ${focusBg}`}
        >
          <p className="text-[7.5px] font-semibold text-[#2e2e2e] uppercase tracking-[0.12em] mb-0.5">Focus</p>
          <p className={`text-[11px] font-semibold leading-snug ${focusTextColor}`}>{focus.title}</p>
          <p className="text-[8.5px] text-[#444] mt-0.5 leading-snug">{focus.reason}</p>
        </Link>

        {/* Runtime status */}
        <div className="bg-[#0e0e0e] border border-[#1c1c1c] rounded-xl px-3 py-2">
          <SectionDivider label="Scheduled Jobs" />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[9.5px] font-medium ${rt.text}`}>{data.runtime.active_jobs} active</span>
            {data.runtime.recent_failures > 0 ? (
              <span className="text-[8.5px] text-red-400">⚠ {data.runtime.recent_failures} failed</span>
            ) : (
              <span className="text-[8.5px] text-[#252525]">no failures</span>
            )}
          </div>
          <p className="text-[7.5px] text-[#252525] mt-0.5">Success: {relativeTime(data.runtime.last_success_at)}</p>
        </div>

        {/* Counter grid */}
        <div className="grid grid-cols-3 gap-1">
          <CounterTile
            href="/approvals"
            value={data.approvals.pending_count}
            label="Approvals"
            sub={data.approvals.stale_count > 0 ? `${data.approvals.stale_count} stale` : undefined}
            valueColor={data.approvals.stale_count > 0 ? 'text-[#f59e0b]' : data.approvals.pending_count > 0 ? 'text-[#e5e5e5]' : 'text-[#2a2a2a]'}
          />
          <CounterTile
            href="/dashboard"
            value={data.blockers.open_count}
            label="Blockers"
            sub={data.blockers.critical_count > 0 ? `${data.blockers.critical_count} crit` : undefined}
            valueColor={data.blockers.critical_count > 0 ? 'text-red-400' : data.blockers.open_count > 0 ? 'text-[#e5e5e5]' : 'text-[#2a2a2a]'}
          />
          <CounterTile
            href="/inbox"
            value={data.inbox.uncategorised_count}
            label="Inbox"
            sub={data.inbox.latest_email_at ? relativeTime(data.inbox.latest_email_at) : undefined}
            valueColor={data.inbox.uncategorised_count > 0 ? 'text-[#f59e0b]' : 'text-[#2a2a2a]'}
          />
        </div>

        {/* Conditional rows */}
        {(data.suggestions.pending_count > 0 || data.chains.waiting_count > 0 || data.memories.active_count > 0) && (
          <div className="space-y-1">
            {data.suggestions.pending_count > 0 && (
              <RowLink href="/inbox#workflow-suggestions" label="Workflow suggestions" value={data.suggestions.pending_count} />
            )}
            {data.chains.waiting_count > 0 && (
              <RowLink href="/workflows#chain-runs" label="Chains waiting" value={data.chains.waiting_count} valueColor="text-blue-400" borderColor="border-blue-500/15" />
            )}
            {data.memories.active_count > 0 && (
              <RowLink href="/memory" label="Operational memories" value={data.memories.active_count} valueColor="text-violet-400" borderColor="border-violet-500/15" />
            )}
          </div>
        )}

        {/* Unread alerts */}
        {data.notifications.unread_count > 0 && (
          <div className="flex items-center justify-between bg-red-500/[0.04] border border-red-500/14 rounded-xl px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9.5px] text-[#4a4a4a]">Unread alerts</span>
            </div>
            <span className="text-[10.5px] font-semibold text-red-400 tabular-nums">{data.notifications.unread_count}</span>
          </div>
        )}

        {/* Recent events */}
        <div>
          <SectionDivider label="Recent Events" />
          <div className="space-y-px mt-1">
            {data.feed.length === 0 ? (
              <p className="text-[8.5px] text-[#1e1e1e] text-center py-2.5">No recent events</p>
            ) : (
              data.feed.map(event => {
                const cfg = SEVERITY_CFG[event.severity] ?? SEVERITY_CFG.info
                const abbr = eventCategory(event.event_type)
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 bg-[#0d0d0d] border border-[#181818] rounded-lg px-2 py-1.5 hover:border-[#222] transition-colors"
                  >
                    <div className={`w-[2px] self-stretch rounded-full shrink-0 ${cfg.barColor} opacity-70`} />

                    <span className="text-[7px] text-[#2a2a2a] font-mono font-bold shrink-0 w-7">{abbr}</span>

                    <p className="text-[8.5px] text-[#525252] truncate flex-1 leading-snug">{event.title}</p>

                    <span className="text-[7px] text-[#1e1e1e] tabular-nums font-mono shrink-0">
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
      <div className="h-12 bg-[#111] rounded-xl" />
      <div className="h-10 bg-[#111] rounded-xl" />
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map(i => <div key={i} className="h-12 bg-[#111] rounded-xl" />)}
      </div>
      <div className="h-7 bg-[#111] rounded-xl" />
      <div className="space-y-px">
        {[0, 1, 2, 4].map(i => <div key={i} className="h-8 bg-[#111] rounded-lg" />)}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ZOperationalSidebar() {
  const [data, setData]               = useState<SidebarData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [refreshing, setRefreshing]   = useState(false)
  const [open, setOpen]               = useState(false)

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

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const panelContent = (
    <div className="flex flex-col h-full border-l border-[#131313]" style={{ background: '#0a0a0a' }}>
      {loading && !data ? (
        <>
          <div className="flex items-center justify-between px-3.5 h-14 border-b border-[#131313]">
            <div className="w-20 h-2.5 bg-[#181818] rounded animate-pulse" />
            <div className="w-10 h-2 bg-[#181818] rounded animate-pulse" />
          </div>
          <SidebarSkeleton />
        </>
      ) : error ? (
        <>
          <div className="flex items-center px-3.5 h-14 border-b border-[#131313]">
            <span className="text-[10px] font-semibold text-[#bbb]">Z Runtime</span>
          </div>
          <div className="p-3">
            <p className="text-[8.5px] text-red-400 text-center">⚠ {error}</p>
          </div>
        </>
      ) : data ? (
        <SidebarContent
          data={data}
          lastRefresh={lastRefresh}
          onRefresh={() => void load(true)}
          refreshing={refreshing}
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
        className="lg:hidden fixed bottom-4 right-4 z-30 w-10 h-10 rounded-xl bg-[#f59e0b] text-black font-bold text-sm flex items-center justify-center shadow-lg"
        aria-label="Open Z Runtime"
      >
        Z
      </button>

      {/* Mobile: overlay panel */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          />
          <div className="w-72 h-full overflow-hidden relative">
            {panelContent}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 left-3 text-[#444] hover:text-[#888] text-lg leading-none"
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
