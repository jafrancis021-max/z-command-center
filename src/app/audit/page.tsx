'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AuditEntry } from '@/app/api/audit/route'

// ── Config ────────────────────────────────────────────────────────────────────

const SOURCE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  audit:    { label: 'System',   color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'    },
  approval: { label: 'Approval', color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200'   },
  workflow: { label: 'Workflow', color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200'  },
  browser:  { label: 'Browser',  color: 'text-cyan-700',   bg: 'bg-cyan-50',    border: 'border-cyan-200'    },
  feed:     { label: 'Feed',     color: 'text-gray-500',   bg: 'bg-gray-100',   border: 'border-gray-200'    },
}

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-amber-400',
  success:  'bg-[#10B981]',
  info:     'bg-gray-300',
}

const STATUS_COLOR: Record<string, string> = {
  approved:  'text-green-700',
  rejected:  'text-red-600',
  pending:   'text-amber-700',
  completed: 'text-green-700',
  failed:    'text-red-600',
  running:   'text-amber-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function dateGroup(iso: string): string {
  const d          = new Date(iso)
  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yestStart  = new Date(todayStart.getTime() - 86_400_000)
  if (d >= todayStart) return 'Today'
  if (d >= yestStart)  return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function groupByDate(entries: AuditEntry[]): Array<{ label: string; items: AuditEntry[] }> {
  const map = new Map<string, AuditEntry[]>()
  for (const e of entries) {
    const g = dateGroup(e.created_at)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(e)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

// ── Audit row ─────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false)
  const src = SOURCE_CFG[entry.source] ?? SOURCE_CFG.feed
  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0

  return (
    <div className="animate-audit-entry-in border-b border-gray-100 last:border-0">
      <button
        onClick={() => hasMetadata && setExpanded(v => !v)}
        className={`w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors ${
          hasMetadata ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Severity dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${SEV_DOT[entry.severity] ?? 'bg-gray-300'}`} />

        {/* Source badge */}
        <span className={`shrink-0 text-[8.5px] font-semibold px-1.5 py-0.5 rounded border ${src.bg} ${src.color} ${src.border} leading-none mt-0.5`}>
          {src.label}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[10px] font-medium text-gray-700 leading-snug truncate">
              {entry.title}
            </p>
            {entry.status && (
              <span className={`text-[8.5px] font-mono shrink-0 ${STATUS_COLOR[entry.status] ?? 'text-gray-400'}`}>
                {entry.status}
              </span>
            )}
          </div>

          {entry.description && (
            <p className="text-[9px] text-gray-400 mt-0.5 truncate leading-snug">{entry.description}</p>
          )}

          {(entry.project_name || entry.category || entry.actor) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {entry.project_name && (
                <span className="text-[8px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                  {entry.project_name}
                </span>
              )}
              {entry.category && (
                <span className="text-[8px] text-gray-400 font-mono">{entry.category}</span>
              )}
              {entry.actor && (
                <span className="text-[8px] text-gray-400">by {entry.actor.slice(0, 12)}…</span>
              )}
            </div>
          )}
        </div>

        {/* Right: time + expand hint */}
        <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
          <span className="text-[8px] text-gray-400 font-mono tabular-nums">{relativeTime(entry.created_at)}</span>
          {hasMetadata && (
            <span className={`text-[8px] text-gray-300 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>›</span>
          )}
        </div>
      </button>

      {/* Expanded metadata */}
      {expanded && hasMetadata && (
        <div className="px-4 pb-3 pt-0">
          <pre className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[8px] text-gray-500 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type SourceFilter   = 'all' | AuditEntry['source']
type SeverityFilter = 'all' | AuditEntry['severity']

const SOURCES:    SourceFilter[]   = ['all', 'audit', 'approval', 'workflow', 'browser', 'feed']
const SEVERITIES: SeverityFilter[] = ['all', 'critical', 'warning', 'success', 'info']

const SEV_LABEL: Record<string, string> = {
  all:      'All',
  critical: 'Critical',
  warning:  'Warning',
  success:  'Success',
  info:     'Info',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [entries,    setEntries]    = useState<AuditEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [source,     setSource]     = useState<SourceFilter>('all')
  const [severity,   setSeverity]   = useState<SeverityFilter>('all')
  const [search,     setSearch]     = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const load = useCallback(async (s: SourceFilter, sev: SeverityFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (s   !== 'all') params.set('source',   s)
      if (sev !== 'all') params.set('severity', sev)
      const res = await fetch(`/api/audit?${params}`)
      if (res.ok) {
        setEntries(await res.json())
        setLastUpdate(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(source, severity) }, [source, severity, load])

  const displayed = search.trim()
    ? entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (e.category ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : entries

  const groups = groupByDate(displayed)

  const criticalCount = entries.filter(e => e.severity === 'critical').length
  const warningCount  = entries.filter(e => e.severity === 'warning').length

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="2" width="14" height="16" rx="1.5" />
              <path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Audit Trail</h1>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {criticalCount > 0 && (
            <span className="text-[8.5px] text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[8.5px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {warningCount} warnings
            </span>
          )}
          {lastUpdate && (
            <span className="text-[7.5px] text-gray-300 font-mono">
              {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(source, severity)}
            className="text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            ↺
          </button>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1100px] mx-auto">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Source tabs */}
          <div className="flex items-center bg-gray-100 border border-gray-200 rounded-xl p-0.5 gap-0.5">
            {SOURCES.map(s => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors capitalize ${
                  source === s
                    ? 'bg-white text-gray-700 shadow-sm border border-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {s === 'all' ? 'All Sources' : (SOURCE_CFG[s]?.label ?? s)}
              </button>
            ))}
          </div>

          {/* Severity filter */}
          <div className="flex items-center gap-1">
            {SEVERITIES.map(sev => (
              <button
                key={sev}
                onClick={() => setSeverity(sev)}
                className={`flex items-center gap-1 text-[8.5px] px-2 py-1 rounded-lg border transition-colors ${
                  severity === sev
                    ? 'bg-white border-gray-200 text-gray-700 shadow-sm'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {sev !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[sev]}`} />
                )}
                {SEV_LABEL[sev]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-1.5 text-[9.5px] text-gray-600 placeholder:text-gray-300 focus:outline-none focus:border-blue-300 w-40 transition-all focus:w-56"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs"
              >×</button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          {[
            { label: 'Total',    value: entries.length,                                         color: 'text-gray-400'  },
            { label: 'Critical', value: entries.filter(e => e.severity === 'critical').length,  color: 'text-red-600'   },
            { label: 'Warnings', value: entries.filter(e => e.severity === 'warning').length,   color: 'text-amber-600' },
            { label: 'Success',  value: entries.filter(e => e.severity === 'success').length,   color: 'text-green-700' },
            { label: 'Approvals',value: entries.filter(e => e.source === 'approval').length,    color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-center shadow-sm">
              <p className={`text-[16px] font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[7.5px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Entries */}
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-pulse shadow-sm">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-200 shrink-0" />
                <div className="h-2 bg-gray-100 rounded flex-1 max-w-[140px]" />
                <div className="h-2 bg-gray-100 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-200 rounded-2xl shadow-sm">
            <p className="text-sm text-gray-400">No audit entries</p>
            <p className="text-[9.5px] text-gray-300 mt-1">System events will appear here as they occur</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.label}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[8px] font-semibold text-gray-400 uppercase tracking-[0.12em]">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[7.5px] text-gray-300 tabular-nums">{group.items.length}</span>
                </div>

                {/* Entry list */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  {group.items.map(entry => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
