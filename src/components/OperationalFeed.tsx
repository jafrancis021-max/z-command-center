'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FeedEvent, FeedSeverity } from '@/types'

const SEVERITY_CONFIG: Record<FeedSeverity, { dot: string; label: string }> = {
  info:     { dot: 'bg-[#525252]',   label: 'text-[#737373]' },
  success:  { dot: 'bg-[#22c55e]',   label: 'text-[#22c55e]' },
  warning:  { dot: 'bg-[#f59e0b]',   label: 'text-[#f59e0b]' },
  critical: { dot: 'bg-red-500',     label: 'text-red-400' },
}

const ALL_SEVERITIES: FeedSeverity[] = ['info', 'success', 'warning', 'critical']

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

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-[#525252] uppercase tracking-wider">Operational Feed</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              filter === 'all' ? 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30' : 'text-[#525252] hover:text-[#a3a3a3]'
            }`}
          >
            All
          </button>
          {ALL_SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[10px] px-2 py-0.5 rounded capitalize transition-colors ${
                filter === s
                  ? `${SEVERITY_CONFIG[s].label} bg-[#1a1a1a] border border-[#2a2a2a]`
                  : 'text-[#525252] hover:text-[#a3a3a3]'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={load}
            className="ml-1 text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-[#525252] py-4 text-center">Loading feed…</div>
      ) : events.length === 0 ? (
        <div className="text-xs text-[#525252] py-4 text-center">No events yet.</div>
      ) : (
        <div className="space-y-1.5">
          {events.map(ev => {
            const cfg = SEVERITY_CONFIG[ev.severity] ?? SEVERITY_CONFIG.info
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2.5"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#e5e5e5] font-medium truncate">{ev.title}</span>
                    {ev.project_name && (
                      <span className="text-[10px] text-[#525252] shrink-0">{ev.project_name}</span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-xs text-[#737373] mt-0.5 line-clamp-2">{ev.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] capitalize ${cfg.label}`}>{ev.severity}</span>
                    <span className="text-[10px] text-[#525252]">·</span>
                    <span className="text-[10px] text-[#525252] font-mono">{ev.event_type}</span>
                    <span className="text-[10px] text-[#525252] ml-auto shrink-0">{relativeTime(ev.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
