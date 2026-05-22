'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FeedEvent, FeedSeverity } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<FeedSeverity, {
  bar: string; dot: string; text: string; badge: string; label: string; tile: string
}> = {
  info:     { bar: 'bg-gray-200',    dot: 'bg-gray-300',    text: 'text-gray-400',  badge: 'bg-gray-100 text-gray-500 border-gray-200',              tile: 'bg-gray-100 text-gray-400',              label: 'Info'    },
  success:  { bar: 'bg-[#10B981]',   dot: 'bg-[#10B981]',   text: 'text-green-700', badge: 'bg-green-50 text-green-700 border-green-200',            tile: 'bg-green-50 text-green-700',             label: 'Success' },
  warning:  { bar: 'bg-amber-400',   dot: 'bg-amber-400',   text: 'text-amber-700', badge: 'bg-amber-50 text-amber-700 border-amber-200',            tile: 'bg-amber-50 text-amber-700',             label: 'Warning' },
  critical: { bar: 'bg-red-500',     dot: 'bg-red-500',     text: 'text-red-700',   badge: 'bg-red-50 text-red-700 border-red-200',                  tile: 'bg-red-50 text-red-700',                 label: 'Crit'    },
}

const CATEGORY_CFG: Record<string, { label: string; color: string; icon: string; abbr: string }> = {
  workflow:  { label: 'workflow',  color: 'text-violet-600',  icon: '⬡',  abbr: 'WF'   },
  approval:  { label: 'approval',  color: 'text-amber-700',   icon: '◈',  abbr: 'AP'   },
  memory:    { label: 'memory',    color: 'text-violet-500',  icon: '◉',  abbr: 'MEM'  },
  blocker:   { label: 'blocker',   color: 'text-red-600',     icon: '⚠',  abbr: 'BLK'  },
  inbox:     { label: 'inbox',     color: 'text-blue-600',    icon: '◻',  abbr: 'IN'   },
  chain:     { label: 'chain',     color: 'text-cyan-600',    icon: '⟳',  abbr: 'CH'   },
  execution: { label: 'exec',      color: 'text-emerald-600', icon: '▣',  abbr: 'EXEC' },
  alert:     { label: 'alert',     color: 'text-orange-600',  icon: '◐',  abbr: 'ALT'  },
  runtime:   { label: 'sys',       color: 'text-gray-400',    icon: '·',  abbr: 'SYS'  },
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
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-pulse shadow-sm">
      {[88, 72, 95, 65, 80].map((w, i) => (
        <div key={i} className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 last:border-b-0">
          <div className="w-[2px] h-6 bg-gray-200 rounded-full shrink-0" />
          <div className="w-7 h-4 rounded bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-2 bg-gray-100 rounded" style={{ width: `${w}%` }} />
            <div className="h-1.5 w-1/5 bg-gray-100 rounded" />
          </div>
          <div className="w-5 h-1.5 bg-gray-100 rounded shrink-0" />
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
    <div className="flex items-center gap-2 px-2.5 py-[7px] border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors duration-75 group">
      {/* Severity bar */}
      <div className={`w-[2px] self-stretch rounded-full shrink-0 ${sev.bar}`} />

      {/* Category abbr tile */}
      <div className={`w-7 h-4 rounded flex items-center justify-center shrink-0 text-[7px] font-bold tracking-wide ${sev.tile}`}>
        {cat.abbr}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] text-gray-600 group-hover:text-gray-800 truncate leading-snug transition-colors">
          {ev.title}
        </p>
        <div className="flex items-center gap-1 mt-px">
          <span className={`text-[7.5px] font-semibold uppercase tracking-wide ${cat.color}`}>{cat.label}</span>
          {ev.project_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-[7.5px] text-gray-400 truncate">{ev.project_name}</span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[7.5px] text-gray-400 tabular-nums font-mono">
        {relativeTime(ev.created_at)}
      </span>
    </div>
  )
}

// ── Time group label ──────────────────────────────────────────────────────────

function TimeGroup({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-50 border-b border-gray-100">
      <span className="text-[7px] text-gray-400 uppercase tracking-[0.14em] font-semibold">{label}</span>
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
      {/* Section header with filters inline */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse shrink-0" />
          <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Live Feed</h2>
          {!loading && events.length > 0 && (
            <span className="text-[8px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full tabular-nums">
              {events.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setFilter('all')}
            className={`text-[8.5px] px-2 py-0.5 rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-gray-100 text-gray-600 border border-gray-200'
                : 'text-gray-400 hover:text-gray-600'
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
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
          <button
            onClick={() => void load(true)}
            className={`ml-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Content panel */}
      {loading ? (
        <FeedSkeleton />
      ) : events.length === 0 ? (
        <div className="text-center py-10 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <span className="text-gray-200 text-sm">·</span>
          <p className="text-[9.5px] text-gray-300 mt-2">No feed events yet.</p>
        </div>
      ) : showGroups ? (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {groups.map(group => (
            <div key={group.label}>
              <TimeGroup label={group.label} />
              {group.events.map(ev => <FeedRow key={ev.id} ev={ev} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {events.map(ev => <FeedRow key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}
