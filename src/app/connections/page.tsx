'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { ConnectionStatus } from '@/app/api/connections/route'

// ── Icons ─────────────────────────────────────────────────────────────────────

function IntegrationIcon({ id }: { id: string }) {
  const cls = 'w-5 h-5'
  switch (id) {
    case 'gmail':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="16" height="12" rx="1.5"/><path d="M2 7l8 5.5L18 7" strokeLinecap="round"/></svg>
    case 'google_calendar':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="14" height="13" rx="1.5"/><path d="M3 8h14M7 2v4M13 2v4M7 11h2M11 11h2M7 14h2M11 14h2" strokeLinecap="round"/></svg>
    case 'supabase':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="10" cy="7" rx="7" ry="3.5"/><path d="M3 7v6c0 1.93 3.13 3.5 7 3.5s7-1.57 7-3.5V7" strokeLinecap="round"/><path d="M3 10c0 1.93 3.13 3.5 7 3.5s7-1.57 7-3.5" strokeLinecap="round"/></svg>
    case 'playwright':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="16" height="11" rx="2"/><path d="M2 7h16M6 16h8" strokeLinecap="round"/><circle cx="5.5" cy="5" r="0.75" fill="currentColor" stroke="none"/><circle cx="8.5" cy="5" r="0.75" fill="currentColor" stroke="none"/></svg>
    case 'document_intake':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2.5h7l3.5 3.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V3.5A1 1 0 015 2.5z" strokeLinejoin="round"/><path d="M12 2.5v4h3.5M7 10h6M7 13h4" strokeLinecap="round"/></svg>
    case 'operational_memory':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="3"/><path d="M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5" strokeLinecap="round"/></svg>
    case 'notifications':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 2.5A5 5 0 005 7.5V11l-1.5 2h13L15 11V7.5a5 5 0 00-5-5z" strokeLinejoin="round"/><path d="M8 15.5a2 2 0 004 0" strokeLinecap="round"/></svg>
    case 'workflow_engine':
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="10" r="2.5"/><circle cx="15" cy="5.5" r="2.5"/><circle cx="15" cy="14.5" r="2.5"/><path d="M7.5 10h3.5M12.5 7l-2 2M12.5 13l-2-2" strokeLinecap="round"/></svg>
    default:
      return <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7.5"/><path d="M10 7v3M10 13v.5" strokeLinecap="round"/></svg>
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  connected:    { dot: 'bg-[#10B981]',               text: 'text-green-700',  border: 'border-gray-200',  bg: 'bg-white',       label: 'Connected'    },
  degraded:     { dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-700',  border: 'border-amber-200', bg: 'bg-amber-50',    label: 'Degraded'     },
  disconnected: { dot: 'bg-gray-400',                 text: 'text-gray-400',   border: 'border-gray-200',  bg: 'bg-gray-50',     label: 'Disconnected' },
  placeholder:  { dot: 'bg-gray-300',                 text: 'text-gray-300',   border: 'border-gray-200',  bg: 'bg-gray-50',     label: 'Planned'      },
} as const

const CATEGORY_COLOR: Record<string, string> = {
  comms:        'text-blue-600',
  database:     'text-violet-600',
  execution:    'text-amber-600',
  intelligence: 'text-green-600',
  storage:      'text-cyan-600',
  automation:   'text-pink-600',
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ConnectionCard({ conn }: { conn: ConnectionStatus }) {
  const cfg     = STATUS_CFG[conn.status]
  const catColor = CATEGORY_COLOR[conn.category] ?? 'text-[#666]'

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`shrink-0 ${conn.status === 'placeholder' ? 'text-gray-300' : 'text-gray-400'}`}>
            <IntegrationIcon id={conn.id} />
          </div>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold leading-none truncate ${conn.status === 'placeholder' ? 'text-gray-300' : 'text-gray-800'}`}>{conn.name}</p>
            <p className={`text-[8px] mt-0.5 ${catColor}`}>{conn.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          <span className={`text-[8px] font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Description */}
      <p className={`text-[9px] leading-relaxed ${conn.status === 'placeholder' ? 'text-gray-300' : 'text-gray-500'}`}>
        {conn.description}
      </p>

      {/* Stats row */}
      {conn.status !== 'placeholder' && (
        <div className="flex items-center gap-3">
          {conn.health_note && (
            <span className="text-[8.5px] text-gray-500">{conn.health_note}</span>
          )}
          <span className="text-[8px] text-gray-400 ml-auto tabular-nums">
            {conn.last_activity ? relativeTime(conn.last_activity) : 'no activity'}
          </span>
        </div>
      )}

      {/* Warnings */}
      {conn.warnings.map((w, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[8px] text-amber-700">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {w}
        </div>
      ))}

      {/* Action */}
      <div className="mt-auto pt-1">
        {conn.action_href && conn.status !== 'placeholder' ? (
          <Link
            href={conn.action_href}
            className="text-[8.5px] text-gray-500 hover:text-gray-700 transition-colors border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-lg inline-block"
          >
            View →
          </Link>
        ) : (
          <span className="text-[8px] text-gray-300">
            {conn.status === 'placeholder' ? 'Coming soon' : conn.status === 'disconnected' ? 'Not configured' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ConnectionsData {
  connections:  ConnectionStatus[]
  generated_at: string
  summary: {
    connected:    number
    degraded:     number
    disconnected: number
    placeholder:  number
  }
}

export default function ConnectionsPage() {
  const [data,    setData]    = useState<ConnectionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.ok ? r.json() as Promise<ConnectionsData> : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const active   = data?.connections.filter(c => !c.future) ?? []
  const future   = data?.connections.filter(c => c.future)  ?? []

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
          </span>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Connections</p>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        {data && (
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-green-600">{data.summary.connected} connected</span>
            {data.summary.degraded > 0 && <span className="text-[9px] text-amber-600">{data.summary.degraded} degraded</span>}
            {data.summary.disconnected > 0 && <span className="text-[9px] text-gray-400">{data.summary.disconnected} disconnected</span>}
          </div>
        )}
        <div className="ml-auto">
          <Link href="/dashboard" className="text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</Link>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1200px] mx-auto space-y-6">

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 bg-gray-100 border border-gray-200 rounded-2xl" />
            ))}
          </div>
        )}

        {/* ── Active integrations ───────────────────────────────────── */}
        {active.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Operational Systems</h2>
              <p className="text-[9px] text-gray-400">{active.length} integration{active.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {active.map(c => <ConnectionCard key={c.id} conn={c} />)}
            </div>
          </section>
        )}

        {/* ── Planned integrations ──────────────────────────────────── */}
        {future.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Planned Integrations</h2>
              <p className="text-[9px] text-gray-400">{future.length} planned</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {future.map(c => <ConnectionCard key={c.id} conn={c} />)}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}
