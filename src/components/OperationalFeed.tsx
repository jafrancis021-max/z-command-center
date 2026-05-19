'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FeedEvent, FeedSeverity } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<FeedSeverity, {
  bar: string; dot: string; text: string; badge: string; label: string; tile: string
}> = {
  info:     { bar: 'bg-[#222]',     dot: 'bg-[#383838]', text: 'text-[#555]',    badge: 'bg-[#161616] text-[#444] border-[#1e1e1e]',              tile: 'bg-[#111] text-[#444]',              label: 'Info'    },
  success:  { bar: 'bg-[#22c55e]',  dot: 'bg-[#22c55e]', text: 'text-[#22c55e]', badge: 'bg-[#22c55e]/[0.08] text-[#22c55e] border-[#22c55e]/20', tile: 'bg-[#22c55e]/[0.07] text-[#22c55e]', label: 'Success' },
  warning:  { bar: 'bg-[#f59e0b]',  dot: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', badge: 'bg-[#f59e0b]/[0.08] text-[#f59e0b] border-[#f59e0b]/20', tile: 'bg-[#f59e0b]/[0.07] text-[#f59e0b]', label: 'Warning' },
  critical: { bar: 'bg-red-500',    dot: 'bg-red-500',   text: 'text-red-400',  badge: 'bg-red-500/[0.08] text-red-400 border-red-500/20',       tile: 'bg-red-500/[0.07] text-red-400',       label: 'Crit'    },
}

const CATEGORY_CFG: Record<string, { label: string; color: string; icon: string; abbr: string }> = {
  workflow:  { label: 'workflow',  color: 'text-violet-400',  icon: '⬡',  abbr: 'WF'   },
  approval:  { label: 'approval',  color: 'text-[#f59e0b]',   icon: '◈',  abbr: 'AP'   },
  memory:    { label: 'memory',    color: 'text-violet-300',  icon: '◉',  abbr: 'MEM'  },
  blocker:   { label: 'blocker',   color: 'text-red-400',     icon: '⚠',  abbr: 'BLK'  },
  inbox:     { label: 'inbox',     color: 'text-blue-400',    icon: '◻',  abbr: 'IN'   },
  chain:     { label: 'chain',     color: 'text-cyan-400',    icon: '⟳',  abbr: 'CH'   },
  execution: { label: 'exec',      color: 'text-emerald-400', icon: '▣',  abbr: 'EXEC' },
  alert:     { label: 'alert',     color: 'text-orange-400',  icon: '◐',  abbr: 'ALT'  },
  runtime:   { label: 'sys',       color: 'text-[#555]',      icon: '·',  abbr: 'SYS'  },
}

function eventCategory(type: string) {
  const t = type.toLowerCase()
  if (t.includes('workflow'))     return CATEGORY_CFG.workflow
  if (t.includes('approval'))     return CATEGORY_CFG.approval
  if (t.includes('memory'))       return CATEGORY_CFG.memory
  if (t.includes('blocker'))      return CATEGORY_CFG.blocker
  if (t.includes('inbox'))        return CATEGORY_CFG.inbox
  if (t.includes('chain'))        return CATEGORY_CFG.chain
  if (t.includes('browser'))      return CATEGORY_CFG.execution
  if (t.includes('notification')) return CATEGORY_CFG.alert
  return CATEGORY_CFG.runtime
}

const ALL_SEVERITIES: FeedSeverity[] = ['info', 'success', 'warning', 'critical']

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60)  return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function groupEvents(events: FeedEvent[]): { label: string; events: FeedEvent[] }[] {
  const now     = Date.now()
  const oneHour = 3_600_000
  const oneDay  = 86_400_000

  const recent = events.filter(e => now - new Date(e.created_at).getTime() < oneHour)
  const today  = events.filter(e => {
    const diff = now - new Date(e.created_at).getTime()
    return diff >= oneHour && diff < oneDay
  })
  const older  = events.filter(e => now - new Date(e.created_at).getTime() >= oneDay)

  const groups: { label: string; events: FeedEvent[] }[] = []
  if (recent.length > 0) groups.push({ label: 'Last Hour',     events: recent })
  if (today.length > 0)  groups.push({ label: 'Earlier Today', events: today  })
  if (older.length > 0)  groups.push({ label: 'Older',         events: older  })
  return groups
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-px animate-pulse">
      {[88, 72, 95, 65, 80].map((w, i) => (
        <div key={i} className="flex items-center gap-2 bg-[#0c0c0c] border border-[#151515] rounded-xl px-3 py-2">
          <div className="w-[2px] self-stretch bg-[#1a1a1a] rounded-full shrink-0" />
          <div className="w-4 h-4 rounded bg-[#161616] shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-2 bg-[#161616] rounded" style={{ width: `${w}%` }} />
            <div className="h-1.5 w-1/5 bg-[#141414] rounded" />
          </div>
          <div className="w-4 h-1.5 bg-[#141414] rounded shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ── Feed event row ────────────────────────────────────────────────────────────

function FeedRow({ ev }: { ev: FeedEvent }) {
  const sev = SEVERITY_CFG[ev.severity] ?? SEVERITY_CFG.info
  const cat = eventCategory(ev.event_type)

  return (
    <div className="flex items-center gap-2 bg-[#0b0b0b] border border-[#161616] rounded-xl px-2.5 py-2 hover:border-[#1e1e1e] hover:bg-[#0e0e0e] transition-all duration-100 group">
      {/* Severity bar */}
      <div className={`w-[2px] self-stretch rounded-full shrink-0 ${sev.bar}`} />

      {/* Category abbr tile */}
      <div className={`w-8 h-5 rounded flex items-center justify-center shrink-0 text-[7.5px] font-bold tracking-wide border border-[#181818] ${sev.tile}`}>
        {cat.abbr}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] text-[#6a6a6a] group-hover:text-[#888] truncate leading-snug transition-colors">
          {ev.title}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[7.5px] font-semibold uppercase tracking-wide ${cat.color}`}>{cat.label}</span>
          {ev.project_name && (
            <>
              <span className="text-[#1e1e1e]">·</span>
              <span className="text-[7.5px] text-[#2a2a2a] truncate">{ev.project_name}</span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[7.5px] text-[#252525] tabular-nums font-mono">
        {relativeTime(ev.created_at)}
      </span>
    </div>
  )
}

// ── Time group label ──────────────────────────────────────────────────────────

function TimeGroup({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 h-px bg-[#131313]" />
      <span className="text-[7.5px] text-[#252525] uppercase tracking-[0.12em] font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[#131313]" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperationalFeed() {
  const [events, setEvents]         = useState<FeedEvent[]>([])
  const [filter, setFilter]         = useState<FeedSeverity | 'all'>('all')
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    const url = filter === 'all'
      ? '/api/feed?limit=40'
      : `/api/feed?severity=${filter}&limit=40`
    const res = await fetch(url)
    if (res.ok) setEvents(await res.json())
    setLoading(false)
    setRefreshing(false)
  }, [filter])

  useEffect(() => { void load() }, [load])

  const groups    = groupEvents(events)
  const showGroups = filter === 'all' && events.length > 0

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1">
          {!loading && events.length > 0 && (
            <span className="text-[7.5px] text-[#252525] bg-[#0f0f0f] border border-[#191919] px-1.5 py-0.5 rounded-full tabular-nums">
              {events.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setFilter('all')}
            className={`text-[8.5px] px-2 py-0.5 rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-[#1a1a1a] text-[#666] border border-[#242424]'
                : 'text-[#2a2a2a] hover:text-[#555]'
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
                className={`text-[8.5px] px-2 py-0.5 rounded-lg capitalize transition-colors ${
                  filter === s
                    ? `${cfg.badge} border`
                    : 'text-[#2a2a2a] hover:text-[#555]'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
          <button
            onClick={() => void load(true)}
            className={`ml-1 text-[10px] text-[#252525] hover:text-[#555] transition-colors ${refreshing ? 'animate-spin' : ''}`}
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
        <div className="text-center py-10 bg-[#0a0a0a] border border-[#151515] rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-2.5">
            <span className="text-[#252525] text-xs">·</span>
          </div>
          <p className="text-[9.5px] text-[#3a3a3a]">No feed events yet.</p>
        </div>
      ) : showGroups ? (
        <div className="space-y-px">
          {groups.map(group => (
            <div key={group.label}>
              <TimeGroup label={group.label} />
              <div className="space-y-px">
                {group.events.map(ev => <FeedRow key={ev.id} ev={ev} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-px">
          {events.map(ev => <FeedRow key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}
