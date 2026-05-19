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

const SEVERITY_CFG: Record<string, { dot: string; text: string }> = {
  info:     { dot: 'bg-[#3a3a3a]', text: 'text-[#555]' },
  success:  { dot: 'bg-[#22c55e]', text: 'text-[#22c55e]' },
  warning:  { dot: 'bg-[#f59e0b]', text: 'text-[#f59e0b]' },
  critical: { dot: 'bg-red-500',   text: 'text-red-400' },
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
      className="bg-[#111] border border-[#1e1e1e] rounded-xl p-2.5 flex flex-col items-center gap-1 hover:border-[#2a2a2a] transition-colors group"
    >
      <span className={`text-[17px] font-bold leading-none tabular-nums ${valueColor}`}>{value}</span>
      <span className="text-[9px] text-[#444] group-hover:text-[#666] transition-colors text-center leading-tight">{label}</span>
      {sub && <span className="text-[8px] text-[#333] leading-none">{sub}</span>}
    </Link>
  )
}

// ── Row link ──────────────────────────────────────────────────────────────────

function RowLink({
  href, label, value, valueColor = 'text-[#f59e0b]', borderColor = 'border-[#1e1e1e]',
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
      className={`flex items-center justify-between bg-[#0f0f0f] border ${borderColor} rounded-xl px-3 py-2 hover:bg-[#141414] transition-colors`}
    >
      <span className="text-[10px] text-[#555]">{label}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </Link>
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
    focus.title === 'Runtime issue'       ? 'border-red-500/25 bg-red-500/[0.04]' :
    focus.title === 'Stale approvals'     ? 'border-[#f59e0b]/25 bg-[#f59e0b]/[0.04]' :
    focus.title === 'Critical blockers'   ? 'border-red-500/25 bg-red-500/[0.04]' :
    focus.title === 'Inbox triage needed' ? 'border-blue-500/25 bg-blue-500/[0.04]' :
    focus.title === 'All clear'           ? 'border-[#22c55e]/25 bg-[#22c55e]/[0.04]' :
                                            'border-[#1e1e1e] bg-[#0f0f0f]'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#161616] shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rt.dot}`} />
          <span className="text-[11px] font-semibold text-[#c0c0c0]">Z Runtime</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#333] tabular-nums">{lastRefresh.toLocaleTimeString()}</span>
          <button
            onClick={onRefresh}
            title="Refresh"
            className={`text-[#333] hover:text-[#666] transition-colors text-sm leading-none ${refreshing ? 'animate-spin' : ''}`}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 p-3 grow">

        {/* Focus block */}
        <Link
          href={focus.action_url}
          className={`block rounded-xl border px-3 py-2.5 transition-opacity hover:opacity-90 ${focusBg}`}
        >
          <p className="text-[9px] font-semibold text-[#444] uppercase tracking-[0.1em] mb-1">Focus</p>
          <p className="text-[11px] font-semibold text-[#d4d4d4] leading-snug">{focus.title}</p>
          <p className="text-[10px] text-[#555] mt-0.5 leading-snug">{focus.reason}</p>
        </Link>

        {/* Runtime status */}
        <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3 py-2.5">
          <p className="text-[9px] font-semibold text-[#333] uppercase tracking-[0.1em] mb-2">Scheduled Jobs</p>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rt.dot}`} />
              <span className={`text-[11px] font-medium ${rt.text}`}>{rt.label}</span>
            </div>
            <span className="text-[9px] text-[#444] tabular-nums">{data.runtime.active_jobs} active</span>
          </div>
          {data.runtime.recent_failures > 0 && (
            <p className="text-[10px] text-red-400 mb-1">
              ⚠ {data.runtime.recent_failures} failure{data.runtime.recent_failures > 1 ? 's' : ''} today
            </p>
          )}
          <p className="text-[9px] text-[#333]">Last success: {relativeTime(data.runtime.last_success_at)}</p>
        </div>

        {/* Counter grid */}
        <div className="grid grid-cols-3 gap-1.5">
          <CounterTile
            href="/approvals"
            value={data.approvals.pending_count}
            label="Approvals"
            sub={data.approvals.stale_count > 0 ? `${data.approvals.stale_count} stale` : undefined}
            valueColor={data.approvals.stale_count > 0 ? 'text-[#f59e0b]' : data.approvals.pending_count > 0 ? 'text-[#e5e5e5]' : 'text-[#333]'}
          />
          <CounterTile
            href="/dashboard"
            value={data.blockers.open_count}
            label="Blockers"
            sub={data.blockers.critical_count > 0 ? `${data.blockers.critical_count} crit` : undefined}
            valueColor={data.blockers.critical_count > 0 ? 'text-red-400' : data.blockers.open_count > 0 ? 'text-[#e5e5e5]' : 'text-[#333]'}
          />
          <CounterTile
            href="/inbox"
            value={data.inbox.uncategorised_count}
            label="Unread"
            sub={data.inbox.latest_email_at ? relativeTime(data.inbox.latest_email_at) : undefined}
            valueColor={data.inbox.uncategorised_count > 0 ? 'text-[#f59e0b]' : 'text-[#333]'}
          />
        </div>

        {/* Conditional row links */}
        {data.suggestions.pending_count > 0 && (
          <RowLink
            href="/inbox#workflow-suggestions"
            label="Workflow suggestions"
            value={data.suggestions.pending_count}
          />
        )}

        {data.chains.waiting_count > 0 && (
          <RowLink
            href="/workflows#chain-runs"
            label="Chains waiting"
            value={data.chains.waiting_count}
            valueColor="text-blue-400"
            borderColor="border-blue-500/15"
          />
        )}

        {data.memories.active_count > 0 && (
          <RowLink
            href="/memory"
            label="Operational memories"
            value={data.memories.active_count}
            valueColor="text-violet-400"
            borderColor="border-violet-500/15"
          />
        )}

        {data.notifications.unread_count > 0 && (
          <div className="flex items-center justify-between bg-red-500/[0.04] border border-red-500/20 rounded-xl px-3 py-2">
            <span className="text-[10px] text-[#555]">Unread alerts</span>
            <span className="text-[11px] font-semibold text-red-400 tabular-nums">{data.notifications.unread_count}</span>
          </div>
        )}

        {/* Feed */}
        <div>
          <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em] mb-2 px-0.5">
            Recent Events
          </p>

          {data.feed.length === 0 ? (
            <p className="text-[10px] text-[#2a2a2a] text-center py-3">No recent events</p>
          ) : (
            <div className="space-y-1">
              {data.feed.map(event => {
                const cfg = SEVERITY_CFG[event.severity] ?? SEVERITY_CFG.info
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 bg-[#0f0f0f] border border-[#191919] rounded-lg px-2.5 py-1.5"
                  >
                    <span className={`w-1 h-1 rounded-full mt-[5px] shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-[#666] truncate leading-snug">{event.title}</p>
                      <p className="text-[9px] text-[#333] mt-0.5 tabular-nums">{relativeTime(event.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 p-3 animate-pulse">
      <div className="h-14 bg-[#151515] rounded-xl" />
      <div className="h-[72px] bg-[#151515] rounded-xl" />
      <div className="grid grid-cols-3 gap-1.5">
        {[0,1,2].map(i => <div key={i} className="h-14 bg-[#151515] rounded-xl" />)}
      </div>
      <div className="h-8 bg-[#151515] rounded-xl" />
      <div className="h-8 bg-[#151515] rounded-xl" />
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
    <div className="flex flex-col h-full border-l border-[#161616]" style={{ background: '#0b0b0b' }}>
      {loading && !data ? (
        <>
          <div className="flex items-center justify-between px-4 h-14 border-b border-[#161616]">
            <div className="w-24 h-3 bg-[#1a1a1a] rounded animate-pulse" />
            <div className="w-14 h-2 bg-[#1a1a1a] rounded animate-pulse" />
          </div>
          <SidebarSkeleton />
        </>
      ) : error ? (
        <>
          <div className="flex items-center px-4 h-14 border-b border-[#161616]">
            <span className="text-[11px] font-semibold text-[#c0c0c0]">Z Runtime</span>
          </div>
          <div className="p-4">
            <p className="text-[10px] text-red-400 text-center">⚠ {error}</p>
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
      <div className="hidden lg:block fixed right-0 top-0 w-72 h-screen z-20 overflow-hidden">
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
            className="flex-1 bg-black/60"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          />
          <div className="w-72 h-full overflow-hidden relative">
            {panelContent}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 left-3 text-[#525252] hover:text-[#a3a3a3] text-lg leading-none"
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
