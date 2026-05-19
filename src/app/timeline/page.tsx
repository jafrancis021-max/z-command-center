'use client'

import React, { useState, useEffect, useMemo } from 'react'
import type { UnifiedTimelineEntry } from '@/app/api/unified-timeline/route'

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CFG = {
  feed:         { label: 'Feed',          icon: '◐',  color: 'text-blue-400',    bg: 'bg-blue-500/[0.10]',    dot: 'bg-blue-400',    border: 'border-blue-500/25'   },
  notification: { label: 'Notification',  icon: '◻',  color: 'text-[#f59e0b]',  bg: 'bg-[#f59e0b]/[0.08]',  dot: 'bg-[#f59e0b]',   border: 'border-[#f59e0b]/25'  },
  approval:     { label: 'Approval',      icon: '◈',  color: 'text-violet-400',  bg: 'bg-violet-500/[0.09]',  dot: 'bg-violet-400',  border: 'border-violet-500/25'  },
  workflow:     { label: 'Workflow',      icon: '⟳',  color: 'text-[#22c55e]',  bg: 'bg-[#22c55e]/[0.08]',  dot: 'bg-[#22c55e]',   border: 'border-[#22c55e]/20'   },
  browser:      { label: 'Browser',       icon: '▣',  color: 'text-indigo-400',  bg: 'bg-indigo-500/[0.09]',  dot: 'bg-indigo-400',  border: 'border-indigo-500/25'  },
} as const

const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-red-400',
  warning:  'text-[#f59e0b]',
  success:  'text-[#22c55e]',
  info:     'text-blue-400',
}

type SourceFilter = 'all' | 'feed' | 'notification' | 'approval' | 'workflow' | 'browser'

const FILTER_TABS: { id: SourceFilter; label: string; icon: string }[] = [
  { id: 'all',          label: 'All',           icon: '·'  },
  { id: 'feed',         label: 'Feed',          icon: '◐'  },
  { id: 'notification', label: 'Notifications', icon: '◻'  },
  { id: 'approval',     label: 'Approvals',     icon: '◈'  },
  { id: 'workflow',     label: 'Workflows',     icon: '⟳'  },
  { id: 'browser',      label: 'Browser',       icon: '▣'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function groupByDate(entries: UnifiedTimelineEntry[]): { label: string; entries: UnifiedTimelineEntry[] }[] {
  const now       = new Date()
  const todayMs   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yestMs    = todayMs - 86400000
  const weekMs    = todayMs - 7 * 86400000

  const buckets = new Map<string, UnifiedTimelineEntry[]>()
  const order:   string[] = []

  for (const e of entries) {
    const d    = new Date(e.created_at)
    const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    let label: string
    if (dayMs === todayMs) label = 'Today'
    else if (dayMs === yestMs) label = 'Yesterday'
    else if (dayMs >= weekMs) label = d.toLocaleDateString('en-US', { weekday: 'long' })
    else label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    if (!buckets.has(label)) { buckets.set(label, []); order.push(label) }
    buckets.get(label)!.push(e)
  }

  return order.map(label => ({ label, entries: buckets.get(label)! }))
}

// ── Timeline row ──────────────────────────────────────────────────────────────

function TimelineRow({
  entry,
  isLast,
}: {
  entry: UnifiedTimelineEntry
  isLast: boolean
}) {
  const src = SOURCE_CFG[entry.source]
  const sevColor = entry.severity ? (SEVERITY_TEXT[entry.severity] ?? 'text-[#555]') : 'text-[#555]'

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
        <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] shrink-0 ${src.bg} ${src.border}`}>
          <span className={src.color}>{src.icon}</span>
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[24px] bg-[#1a1a1a] mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-[#c0c0c0] leading-snug truncate">
              {entry.title}
            </p>
            {entry.description && (
              <p className="text-[9.5px] text-[#444] line-clamp-2 mt-0.5 leading-snug">
                {entry.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Source badge */}
              <span className={`text-[7.5px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded border ${src.bg} ${src.border} ${src.color}`}>
                {src.label}
              </span>
              {/* Status badge */}
              {entry.status && (
                <span className={`text-[7.5px] font-medium ${sevColor}`}>
                  {entry.status}
                </span>
              )}
              {/* Project badge */}
              {entry.project_name && (
                <span className="text-[7.5px] text-[#333] bg-[#141414] border border-[#1e1e1e] px-1.5 py-0.5 rounded truncate max-w-[100px]">
                  {entry.project_name}
                </span>
              )}
              {/* Category */}
              {entry.category && entry.category !== 'workflow_run' && entry.category !== 'browser_run' && (
                <span className="text-[7.5px] text-[#2a2a2a] font-mono">
                  {entry.category.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
          <span className="text-[9px] text-[#2e2e2e] font-mono shrink-0 mt-0.5 group-hover:text-[#444] transition-colors">
            {relativeTime(entry.created_at)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [entries, setEntries]     = useState<UnifiedTimelineEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<SourceFilter>('all')

  useEffect(() => {
    setLoading(true)
    fetch('/api/unified-timeline?limit=200')
      .then(r => r.json())
      .then((d: UnifiedTimelineEntry[]) => { setEntries(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const filtered = useMemo(() =>
    filter === 'all' ? entries : entries.filter(e => e.source === filter),
    [entries, filter]
  )

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  // Tab counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length }
    for (const e of entries) {
      c[e.source] = (c[e.source] ?? 0) + 1
    }
    return c
  }, [entries])

  return (
    <main className="min-h-screen pt-6 pb-12 px-4 sm:px-6 max-w-[900px] mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-[13px] text-[#3B82F6] font-mono">◐</span>
          <h1 className="text-[13px] font-semibold text-[#d4d4d4] tracking-tight">
            Operational Timeline
          </h1>
          {!loading && (
            <span className="text-[8.5px] text-[#333] font-mono ml-1">
              {filtered.length} events
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#333] pl-[26px]">
          Unified operational history — feed, notifications, approvals, workflows, browser
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_TABS.map(tab => {
          const isActive = filter === tab.id
          const count = counts[tab.id] ?? 0
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-blue-500/[0.08] text-blue-400 border-blue-500/20'
                  : 'text-[#444] border-transparent hover:text-[#777] hover:bg-[#141414]'
              }`}
            >
              <span className="font-mono">{tab.icon}</span>
              {tab.label}
              {count > 0 && (
                <span className={`text-[8px] font-mono ${isActive ? 'text-blue-500/60' : 'text-[#333]'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <span className="inline-block w-3 h-3 rounded-full border border-[#333] border-t-blue-500 animate-spin" />
          <span className="text-[10px] text-[#333]">Loading timeline…</span>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-red-400 bg-red-500/[0.06] border border-red-500/20 rounded-xl px-4 py-3">
          Failed to load timeline: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-[11px] text-[#333] text-center py-16">
          No events
        </div>
      )}

      {!loading && !error && groups.map(group => (
        <div key={group.label} className="mb-6">
          {/* Date group header */}
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[8.5px] font-semibold text-[#2e2e2e] uppercase tracking-[0.12em] whitespace-nowrap">
              {group.label}
            </p>
            <div className="flex-1 border-t border-[#161616]" />
            <span className="text-[8px] text-[#252525] font-mono whitespace-nowrap">
              {group.entries.length}
            </span>
          </div>

          {/* Entries */}
          <div className="pl-0">
            {group.entries.map((entry, i) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                isLast={i === group.entries.length - 1}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Absolute time tooltip overlay: show time on hover via title attr */}
      <style>{`
        .timeline-time { display: none; }
        .group:hover .timeline-time { display: block; }
      `}</style>
    </main>
  )
}
