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
  healthy:  { dot: 'bg-[#22c55e]',             text: 'text-[#22c55e]',  label: 'Healthy'  },
  degraded: { dot: 'bg-[#f59e0b] animate-pulse', text: 'text-[#f59e0b]', label: 'Degraded' },
  error:    { dot: 'bg-red-500 animate-pulse',   text: 'text-red-400',   label: 'Error'    },
}

const SEVERITY_DOT: Record<string, string> = {
  info:     'bg-[#525252]',
  success:  'bg-[#22c55e]',
  warning:  'bg-[#f59e0b]',
  critical: 'bg-red-500',
}

const FOCUS_BORDER: Record<string, string> = {
  'Runtime issue':       'border-red-500/30   bg-red-500/5',
  'Stale approvals':     'border-[#f59e0b]/30 bg-[#f59e0b]/5',
  'Critical blockers':   'border-red-500/30   bg-red-500/5',
  'Inbox triage needed': 'border-blue-500/30  bg-blue-500/5',
  'All clear':           'border-[#22c55e]/30 bg-[#22c55e]/5',
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ data, lastRefresh }: { data: SidebarData; lastRefresh: Date }) {
  const rt     = RUNTIME_CFG[data.runtime.status]
  const focus  = data.focus
  const border = FOCUS_BORDER[focus.title] ?? 'border-[#2a2a2a] bg-[#111]'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#f59e0b] flex items-center justify-center text-black font-bold text-[10px]">
            Z
          </div>
          <span className="text-xs font-semibold text-[#e5e5e5]">Runtime</span>
        </div>
        <span className="text-[10px] text-[#525252]">{lastRefresh.toLocaleTimeString()}</span>
      </div>

      <div className="flex flex-col gap-3 p-3 grow">

        {/* Focus block */}
        <Link
          href={focus.action_url}
          className={`block rounded-xl border px-3 py-2.5 transition-opacity hover:opacity-80 ${border}`}
        >
          <p className="text-[10px] text-[#737373] uppercase tracking-wider mb-1">Current focus</p>
          <p className="text-xs font-semibold text-[#e5e5e5] leading-snug">{focus.title}</p>
          <p className="text-[10px] text-[#737373] mt-0.5 leading-snug">{focus.reason}</p>
        </Link>

        {/* Runtime */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">Scheduled Jobs</p>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rt.dot}`} />
              <span className={`text-xs font-medium ${rt.text}`}>{rt.label}</span>
            </div>
            <span className="text-[10px] text-[#525252]">{data.runtime.active_jobs} active</span>
          </div>
          {data.runtime.recent_failures > 0 && (
            <p className="text-[10px] text-red-400">
              ⚠ {data.runtime.recent_failures} failure{data.runtime.recent_failures > 1 ? 's' : ''} today
            </p>
          )}
          <p className="text-[10px] text-[#525252] mt-1">
            Last success: {relativeTime(data.runtime.last_success_at)}
          </p>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-1.5">
          <Link
            href="/approvals"
            className="bg-[#111] border border-[#1e1e1e] rounded-xl p-2 flex flex-col items-center gap-0.5 hover:border-[#f59e0b]/30 transition-colors group"
          >
            <span className={`text-base font-semibold leading-none ${
              data.approvals.stale_count > 0 ? 'text-[#f59e0b]' :
              data.approvals.pending_count > 0 ? 'text-[#e5e5e5]' : 'text-[#525252]'
            }`}>
              {data.approvals.pending_count}
            </span>
            <span className="text-[9px] text-[#525252] group-hover:text-[#a3a3a3] transition-colors text-center leading-tight">
              Approvals
            </span>
            {data.approvals.stale_count > 0 && (
              <span className="text-[9px] text-[#f59e0b]">{data.approvals.stale_count} stale</span>
            )}
          </Link>

          <Link
            href="/dashboard"
            className="bg-[#111] border border-[#1e1e1e] rounded-xl p-2 flex flex-col items-center gap-0.5 hover:border-[#f59e0b]/30 transition-colors group"
          >
            <span className={`text-base font-semibold leading-none ${
              data.blockers.critical_count > 0 ? 'text-red-400' :
              data.blockers.open_count > 0 ? 'text-[#e5e5e5]' : 'text-[#525252]'
            }`}>
              {data.blockers.open_count}
            </span>
            <span className="text-[9px] text-[#525252] group-hover:text-[#a3a3a3] transition-colors text-center leading-tight">
              Blockers
            </span>
            {data.blockers.critical_count > 0 && (
              <span className="text-[9px] text-red-400">{data.blockers.critical_count} crit</span>
            )}
          </Link>

          <Link
            href="/inbox"
            className="bg-[#111] border border-[#1e1e1e] rounded-xl p-2 flex flex-col items-center gap-0.5 hover:border-[#f59e0b]/30 transition-colors group"
          >
            <span className={`text-base font-semibold leading-none ${
              data.inbox.uncategorised_count > 0 ? 'text-[#f59e0b]' : 'text-[#525252]'
            }`}>
              {data.inbox.uncategorised_count}
            </span>
            <span className="text-[9px] text-[#525252] group-hover:text-[#a3a3a3] transition-colors text-center leading-tight">
              Unread
            </span>
            {data.inbox.latest_email_at && (
              <span className="text-[9px] text-[#525252]">
                {relativeTime(data.inbox.latest_email_at)}
              </span>
            )}
          </Link>
        </div>

        {/* Workflow suggestions */}
        {data.suggestions.pending_count > 0 && (
          <Link
            href="/inbox#workflow-suggestions"
            className="flex items-center justify-between bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2 hover:border-[#f59e0b]/30 transition-colors"
          >
            <span className="text-[9px] text-[#737373]">Workflow suggestions</span>
            <span className="text-xs font-semibold text-[#f59e0b]">{data.suggestions.pending_count}</span>
          </Link>
        )}

        {/* Chain runs awaiting approval */}
        {data.chains.waiting_count > 0 && (
          <Link
            href="/workflows#chain-runs"
            className="flex items-center justify-between bg-[#111] border border-blue-500/20 rounded-xl px-3 py-2 hover:border-blue-500/40 transition-colors"
          >
            <span className="text-[9px] text-[#737373]">Chains waiting</span>
            <span className="text-xs font-semibold text-blue-400">{data.chains.waiting_count}</span>
          </Link>
        )}

        {/* Operational memories */}
        {data.memories.active_count > 0 && (
          <Link
            href="/memory"
            className="flex items-center justify-between bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2 hover:border-violet-500/30 transition-colors"
          >
            <span className="text-[9px] text-[#737373]">Operational memories</span>
            <span className="text-xs font-semibold text-violet-400">{data.memories.active_count}</span>
          </Link>
        )}

        {/* Feed */}
        {data.feed.length > 0 && (
          <div>
            <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1.5 px-0.5">
              Latest events
            </p>
            <div className="space-y-1">
              {data.feed.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 bg-[#111] border border-[#1a1a1a] rounded-lg px-2.5 py-1.5"
                >
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${SEVERITY_DOT[event.severity] ?? 'bg-[#525252]'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#a3a3a3] truncate leading-snug">{event.title}</p>
                    <p className="text-[9px] text-[#525252] mt-0.5">{relativeTime(event.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.feed.length === 0 && (
          <p className="text-[10px] text-[#525252] text-center py-2">No recent feed events</p>
        )}

      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3 animate-pulse">
      <div className="h-16 bg-[#1a1a1a] rounded-xl" />
      <div className="h-20 bg-[#1a1a1a] rounded-xl" />
      <div className="grid grid-cols-3 gap-1.5">
        <div className="h-14 bg-[#1a1a1a] rounded-xl" />
        <div className="h-14 bg-[#1a1a1a] rounded-xl" />
        <div className="h-14 bg-[#1a1a1a] rounded-xl" />
      </div>
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function SidebarError({ message }: { message: string }) {
  return (
    <div className="p-3">
      <p className="text-[10px] text-red-400 text-center">⚠ {message}</p>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ZOperationalSidebar() {
  const [data, setData]               = useState<SidebarData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [open, setOpen]               = useState(false)   // mobile panel

  const load = useCallback(async () => {
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
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const panelContent = (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-l border-[#1a1a1a]">
      {loading && !data ? (
        <>
          {/* Header skeleton */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
            <div className="w-20 h-3 bg-[#1a1a1a] rounded animate-pulse" />
            <div className="w-12 h-2 bg-[#1a1a1a] rounded animate-pulse" />
          </div>
          <SidebarSkeleton />
        </>
      ) : error ? (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
            <span className="text-xs font-semibold text-[#e5e5e5]">Z Runtime</span>
          </div>
          <SidebarError message={error} />
        </>
      ) : data ? (
        <SidebarContent data={data} lastRefresh={lastRefresh} />
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
          {/* backdrop */}
          <button
            className="flex-1 bg-black/60"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          />
          {/* panel */}
          <div className="w-72 h-full overflow-hidden relative">
            {panelContent}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-[#525252] hover:text-[#a3a3a3] text-lg leading-none"
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
