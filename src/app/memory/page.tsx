'use client'

import { useState, useEffect, useCallback } from 'react'
import type { OperationalMemory, MemoryType } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<MemoryType, { label: string; color: string; dot: string; badge: string }> = {
  recurring_workflow: {
    label: 'Recurring Workflow',
    color: 'text-violet-400',
    dot:   'bg-violet-400',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  repeated_blocker: {
    label: 'Repeated Blocker',
    color: 'text-red-400',
    dot:   'bg-red-500',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  approval_pattern: {
    label: 'Approval Pattern',
    color: 'text-[#f59e0b]',
    dot:   'bg-[#f59e0b]',
    badge: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
  },
  inbox_pattern: {
    label: 'Inbox Pattern',
    color: 'text-blue-400',
    dot:   'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  chain_pattern: {
    label: 'Chain Pattern',
    color: 'text-cyan-400',
    dot:   'bg-cyan-400',
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  },
  project_context: {
    label: 'Project Context',
    color: 'text-emerald-400',
    dot:   'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  operational_risk: {
    label: 'Operational Risk',
    color: 'text-orange-400',
    dot:   'bg-orange-400',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
}

const ALL_TYPES: MemoryType[] = [
  'recurring_workflow',
  'repeated_blocker',
  'approval_pattern',
  'inbox_pattern',
  'chain_pattern',
  'project_context',
  'operational_risk',
]

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function confidenceBar(c: number) {
  const pct = Math.round(c * 100)
  const color =
    pct >= 80 ? 'bg-[#22c55e]' :
    pct >= 60 ? 'bg-[#f59e0b]' : 'bg-[#525252]'
  return { pct, color }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function MemorySkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[90, 75, 85, 70, 80].map((w, i) => (
        <div key={i} className="flex items-start gap-3 bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2a2a2a] mt-1.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 bg-[#1e1e1e] rounded" style={{ width: `${w}%` }} />
            <div className="h-2 bg-[#1a1a1a] rounded w-2/3" />
            <div className="h-1.5 bg-[#161616] rounded w-1/3" />
          </div>
          <div className="w-12 h-2 bg-[#1a1a1a] rounded shrink-0 mt-1" />
        </div>
      ))}
    </div>
  )
}

// ── Memory card ───────────────────────────────────────────────────────────────

function MemoryCard({ memory }: { memory: OperationalMemory }) {
  const [expanded, setExpanded] = useState(false)
  const cfg   = TYPE_CFG[memory.memory_type] ?? TYPE_CFG.operational_risk
  const { pct, color } = confidenceBar(memory.confidence)

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-xl overflow-hidden hover:border-[#222] transition-colors">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded(v => !v)}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-[#e5e5e5] truncate">{memory.title}</span>
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-medium ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-[#525252] line-clamp-1 leading-relaxed">{memory.summary}</p>

          <div className="flex items-center gap-3 mt-1.5">
            {/* Confidence bar */}
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[9px] text-[#525252] tabular-nums">{pct}%</span>
            </div>

            {/* Recurrence */}
            <span className="text-[9px] text-[#3a3a3a]">
              ×{memory.recurrence_count} occurrences
            </span>

            {/* Evidence count */}
            {(memory.evidence as unknown[]).length > 0 && (
              <span className="text-[9px] text-[#3a3a3a]">
                {(memory.evidence as unknown[]).length} evidence items
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1 ml-2">
          <span className="text-[10px] text-[#3a3a3a] tabular-nums">{relativeTime(memory.last_seen_at)}</span>
          <span className="text-[9px] text-[#2a2a2a]">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-[#1a1a1a] pt-3 space-y-2.5 bg-[#0d0d0d]">
          <p className="text-xs text-[#737373] leading-relaxed">{memory.summary}</p>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-[#3a3a3a] uppercase tracking-wider">Source</span>
              <p className="text-[#525252] font-mono mt-0.5">{memory.source_type}</p>
            </div>
            <div>
              <span className="text-[#3a3a3a] uppercase tracking-wider">First seen</span>
              <p className="text-[#525252] mt-0.5">{relativeTime(memory.first_seen_at)}</p>
            </div>
          </div>

          {(memory.evidence as Array<Record<string, unknown>>).length > 0 && (
            <div>
              <p className="text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Evidence</p>
              <div className="space-y-1">
                {(memory.evidence as Array<Record<string, unknown>>).slice(0, 5).map((ev, i) => (
                  <div key={i} className="text-[10px] text-[#525252] bg-[#111] border border-[#1a1a1a] rounded-lg px-2.5 py-1.5 font-mono">
                    {typeof ev.title === 'string' ? ev.title : JSON.stringify(ev).slice(0, 80)}
                    {typeof ev.status === 'string' && (
                      <span className="ml-2 text-[#3a3a3a]">· {ev.status}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [memories, setMemories]   = useState<OperationalMemory[]>([])
  const [filter, setFilter]       = useState<MemoryType | 'all'>('all')
  const [loading, setLoading]     = useState(true)
  const [running, setRunning]     = useState(false)
  const [lastRun, setLastRun]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = filter === 'all'
      ? '/api/operational-memories?limit=100'
      : `/api/operational-memories?memory_type=${filter}&limit=100`
    const res = await fetch(url)
    if (res.ok) setMemories(await res.json())
    setLoading(false)
  }, [filter])

  useEffect(() => { void load() }, [load])

  async function handleRunConsolidation() {
    setRunning(true)
    try {
      const res = await fetch('/api/jobs/status')
      if (res.ok) {
        // Trigger via the jobs run-once endpoint if available, otherwise just reload
      }
    } finally {
      setRunning(false)
      setLastRun(new Date().toLocaleTimeString())
      await load()
    }
  }

  const byType: Partial<Record<MemoryType | 'all', number>> = { all: memories.length }
  for (const m of memories) {
    byType[m.memory_type] = (byType[m.memory_type] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md px-6 h-14 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Operational Memory</h1>
          <p className="text-[10px] text-[#3a3a3a]">Consolidated patterns from operational history</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastRun && (
            <span className="text-[10px] text-[#3a3a3a]">last run {lastRun}</span>
          )}
          <button
            onClick={handleRunConsolidation}
            disabled={running}
            className="text-xs border border-[#2a2a2a] text-[#525252] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-40"
          >
            {running ? 'Running…' : '⚡ Consolidate now'}
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto space-y-6">

        {/* Stats row */}
        {!loading && memories.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['inbox_pattern', 'approval_pattern', 'repeated_blocker', 'chain_pattern'] as MemoryType[]).map(t => {
              const count = byType[t] ?? 0
              const cfg   = TYPE_CFG[t]
              return (
                <button
                  key={t}
                  onClick={() => setFilter(filter === t ? 'all' : t)}
                  className={`bg-[#111] border rounded-xl p-3 text-left transition-colors ${
                    filter === t ? 'border-[#2a2a2a]' : 'border-[#1a1a1a] hover:border-[#222]'
                  }`}
                >
                  <p className={`text-xl font-bold tabular-nums ${count > 0 ? cfg.color : 'text-[#525252]'}`}>{count}</p>
                  <p className="text-[10px] text-[#3a3a3a] mt-0.5 leading-tight">{cfg.label}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-[#1e1e1e] text-[#a3a3a3] border border-[#2a2a2a]'
                : 'text-[#3a3a3a] hover:text-[#525252]'
            }`}
          >
            All {memories.length > 0 && `(${memories.length})`}
          </button>
          {ALL_TYPES.map(t => {
            const cfg   = TYPE_CFG[t]
            const count = byType[t] ?? 0
            if (count === 0 && filter !== t) return null
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                  filter === t
                    ? `${cfg.badge} border`
                    : 'text-[#3a3a3a] hover:text-[#525252]'
                }`}
              >
                {cfg.label} {count > 0 && `(${count})`}
              </button>
            )
          })}
          <button
            onClick={load}
            className="ml-auto text-[10px] text-[#3a3a3a] hover:text-[#525252] transition-colors"
            title="Refresh"
          >
            ↺
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <MemorySkeleton />
        ) : memories.length === 0 ? (
          <div className="text-center py-16 bg-[#111] border border-[#1a1a1a] rounded-xl">
            <div className="text-3xl mb-3 opacity-20">◎</div>
            <p className="text-sm text-[#525252]">No operational memories yet.</p>
            <p className="text-xs text-[#3a3a3a] mt-1">
              Run the <span className="font-mono text-[#525252]">memory_compaction</span> job to consolidate patterns.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map(m => <MemoryCard key={m.id} memory={m} />)}
          </div>
        )}

      </main>
    </div>
  )
}
