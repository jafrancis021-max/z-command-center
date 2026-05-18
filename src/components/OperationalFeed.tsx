'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FeedEvent, FeedSeverity } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<FeedSeverity, { bar: string; dot: string; label: string; badge: string }> = {
  info:     { bar: 'bg-[#2a2a2a]',  dot: 'bg-[#525252]',  label: 'text-[#525252]',  badge: 'bg-[#1a1a1a] text-[#525252] border-[#222]' },
  success:  { bar: 'bg-[#22c55e]',  dot: 'bg-[#22c55e]',  label: 'text-[#22c55e]',  badge: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20' },
  warning:  { bar: 'bg-[#f59e0b]',  dot: 'bg-[#f59e0b]',  label: 'text-[#f59e0b]',  badge: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20' },
  critical: { bar: 'bg-red-500',    dot: 'bg-red-500',    label: 'text-red-400',    badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const ALL_SEVERITIES: FeedSeverity[] = ['info', 'success', 'warning', 'critical']

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-1.5 animate-pulse">
      {[100, 80, 90, 70, 85].map((w, i) => (
        <div key={i} className="flex items-start gap-3 bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2.5 overflow-hidden">
          <div className="w-1 self-stretch shrink-0 bg-[#1e1e1e] rounded-full" />
          <div className="flex-1 space-y-1.5 py-0.5">
            <div className={`h-2 bg-[#1e1e1e] rounded`} style={{ width: `${w}%` }} />
            <div className="h-1.5 w-1/3 bg-[#1a1a1a] rounded" />
          </div>
          <div className="w-8 h-2 bg-[#1a1a1a] rounded shrink-0 mt-1" />
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperationalFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [filter, setFilter] = useState<FeedSeverity | 'all'>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const url = filter === 'all'
      ? '/api/feed?limit=50'
      : `/api/feed?severity=${filter}&limit=50`
    const res = await fetch(url)
    if (res.ok) setEvents(await res.json())
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-[#e5e5e5]">Operational Feed</h3>
          {events.length > 0 && !loading && (
            <span className="text-[9px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#222] px-1.5 py-0.5 rounded-full tabular-nums">
              {events.length}
            </span>
          )}
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-[#1e1e1e] text-[#a3a3a3] border border-[#2a2a2a]'
                : 'text-[#3a3a3a] hover:text-[#525252]'
            }`}
          >
            All
          </button>
          {ALL_SEVERITIES.map(s => {
            const cfg = SEVERITY_CFG[s]
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded-md capitalize transition-colors ${
                  filter === s
                    ? `${cfg.badge} border`
                    : 'text-[#3a3a3a] hover:text-[#525252]'
                }`}
              >
                {s}
              </button>
            )
          })}
          <button
            onClick={load}
            className="ml-1 text-[10px] text-[#3a3a3a] hover:text-[#525252] transition-colors"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <FeedSkeleton />
      ) : events.length === 0 ? (
        <div className="text-center py-10 text-[#525252] bg-[#111] border border-[#1a1a1a] rounded-xl">
          <p className="text-xs">No feed events yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map(ev => {
            const cfg = SEVERITY_CFG[ev.severity] ?? SEVERITY_CFG.info
            return (
              <div
                key={ev.id}
                className="flex items-stretch gap-0 bg-[#111] border border-[#1a1a1a] rounded-lg overflow-hidden hover:border-[#222] transition-colors"
              >
                {/* Severity bar */}
                <div className={`w-0.5 shrink-0 ${cfg.bar}`} />

                <div className="flex items-start gap-3 flex-1 min-w-0 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#e5e5e5] font-medium truncate">{ev.title}</span>
                      {ev.project_name && (
                        <span className="text-[10px] text-[#3a3a3a] shrink-0">{ev.project_name}</span>
                      )}
                    </div>
                    {ev.description && (
                      <p className="text-xs text-[#525252] mt-0.5 line-clamp-1">{ev.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] capitalize font-medium px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                        {ev.severity}
                      </span>
                      <span className="text-[9px] text-[#2a2a2a] font-mono truncate">{ev.event_type}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#3a3a3a] shrink-0 tabular-nums">{relativeTime(ev.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
