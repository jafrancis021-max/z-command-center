'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'

interface Case {
  id:             string
  title:          string
  type:           string
  status:         string
  priority:       string
  source:         string
  description:    string | null
  document_count: number
  created_at:     string
  updated_at:     string
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
  open:             { dot: 'bg-[#10B981]',               text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  label: 'Open'             },
  in_progress:      { dot: 'bg-blue-500',                text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   label: 'In Progress'      },
  pending_approval: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Pending Approval' },
  resolved:         { dot: 'bg-gray-400',                text: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200',   label: 'Resolved'         },
  closed:           { dot: 'bg-gray-300',                text: 'text-gray-400',   bg: 'bg-gray-50',   border: 'border-gray-200',   label: 'Closed'           },
  archived:         { dot: 'bg-gray-200',                text: 'text-gray-300',   bg: 'bg-gray-50',   border: 'border-gray-200',   label: 'Archived'         },
}

const PRIORITY_CFG: Record<string, { color: string; label: string }> = {
  critical: { color: 'text-red-600',   label: 'Critical' },
  high:     { color: 'text-amber-700', label: 'High'     },
  medium:   { color: 'text-gray-500',  label: 'Medium'   },
  low:      { color: 'text-gray-400',  label: 'Low'      },
}

const TYPE_LABELS: Record<string, string> = {
  general: 'General', claim: 'Claim', contract: 'Contract', compliance: 'Compliance',
  incident: 'Incident', project: 'Project', task_batch: 'Task Batch',
  invoice: 'Invoice', correspondence: 'Correspondence',
}

// ── Case row ──────────────────────────────────────────────────────────────────

function CaseRow({ c, last }: { c: Case; last: boolean }) {
  const scfg = STATUS_CFG[c.status]     ?? STATUS_CFG.open
  const pcfg = PRIORITY_CFG[c.priority] ?? PRIORITY_CFG.medium
  return (
    <Link
      href={`/cases/${c.id}`}
      className={`flex items-center gap-4 px-5 py-3 ${!last ? 'border-b border-gray-100' : ''} hover:bg-gray-50 transition-colors group`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${scfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-gray-700 truncate group-hover:text-gray-900 transition-colors">{c.title}</p>
        {c.description && (
          <p className="text-[8px] text-gray-400 truncate mt-0.5">{c.description}</p>
        )}
      </div>
      <span className="shrink-0 text-[8px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
        {TYPE_LABELS[c.type] ?? c.type}
      </span>
      <span className={`shrink-0 text-[8px] font-medium ${pcfg.color}`}>{pcfg.label}</span>
      {c.document_count > 0 && (
        <span className="shrink-0 text-[7.5px] text-gray-400 tabular-nums">{c.document_count} doc{c.document_count !== 1 ? 's' : ''}</span>
      )}
      <span className={`shrink-0 text-[8px] font-medium ${scfg.text} px-2 py-0.5 rounded-full border ${scfg.border} ${scfg.bg}`}>
        {scfg.label}
      </span>
      <span className="shrink-0 text-[7.5px] text-gray-300 tabular-nums font-mono w-20 text-right">
        {new Date(c.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </span>
    </Link>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const SELECT_CLS = 'text-[8.5px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300 hover:border-gray-300 transition-colors cursor-pointer'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const [cases,    setCases]    = useState<Case[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Filters — applied locally to avoid re-fetching
  const [search,   setSearch]   = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fType,    setFType]    = useState('')
  const [fPrio,    setFPrio]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cases?limit=200')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCases(await res.json() as Case[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return cases.filter(c => {
      if (q && !c.title.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) return false
      if (fStatus && c.status !== fStatus) return false
      if (fType   && c.type   !== fType)   return false
      if (fPrio   && c.priority !== fPrio) return false
      return true
    })
  }, [cases, search, fStatus, fType, fPrio])

  const open        = cases.filter(c => c.status === 'open').length
  const in_progress = cases.filter(c => c.status === 'in_progress').length
  const pending     = cases.filter(c => c.status === 'pending_approval').length

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
          </span>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Operational Cases</p>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center gap-3">
          {open > 0        && <span className="text-[9px] text-green-600">{open} open</span>}
          {in_progress > 0 && <span className="text-[9px] text-blue-600">{in_progress} active</span>}
          {pending > 0     && <span className="text-[9px] text-amber-600">{pending} pending</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 p-1"
            title="Refresh"
          >
            ↻
          </button>
          <Link href="/intake" className="text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors border border-gray-200 px-2.5 py-1.5 rounded-lg">
            + New Intake
          </Link>
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1000px] mx-auto space-y-5">

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            {error}
          </div>
        )}

        {/* ── Summary strip ─────────────────────────────────────────── */}
        <div className="flex items-stretch bg-white border border-gray-200 rounded-2xl overflow-hidden divide-x divide-gray-200 shadow-sm">
          {[
            { label: 'Total',       value: cases.length,   color: 'text-gray-400'   },
            { label: 'Open',        value: open,           color: open > 0        ? 'text-[#10B981]' : 'text-gray-200' },
            { label: 'In Progress', value: in_progress,    color: in_progress > 0 ? 'text-blue-600'  : 'text-gray-200' },
            { label: 'Pending',     value: pending,        color: pending > 0     ? 'text-amber-600' : 'text-gray-200' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-5 py-4 flex-1">
              <p className={`text-[28px] font-bold tabular-nums leading-none ${s.color}`}>{loading ? '–' : s.value}</p>
              <p className="text-[9px] text-gray-400 font-medium tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Filter bar ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search cases…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-[8.5px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-300 placeholder-gray-300 w-44 transition-colors"
          />
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={SELECT_CLS}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)} className={SELECT_CLS}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={fPrio} onChange={e => setFPrio(e.target.value)} className={SELECT_CLS}>
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {(search || fStatus || fType || fPrio) && (
            <button
              onClick={() => { setSearch(''); setFStatus(''); setFType(''); setFPrio('') }}
              className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-[8px] text-gray-300 tabular-nums">
            {loading ? 'Loading…' : `${filtered.length} of ${cases.length}`}
          </span>
        </div>

        {/* ── Case list ─────────────────────────────────────────────── */}
        <section>
          {!loading && filtered.length === 0 ? (
            <div className="text-center py-20 bg-white border border-gray-200 rounded-2xl">
              {cases.length === 0 ? (
                <>
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" strokeLinecap="round"/>
                  </svg>
                  <p className="text-[11px] text-gray-400">No operational cases yet.</p>
                  <p className="text-[9px] mt-1 text-gray-300">Upload a document or add a note to auto-create a case.</p>
                  <Link href="/intake" className="inline-block mt-4 text-[9px] text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:text-gray-700 hover:border-gray-300 transition-colors">
                    Go to Intake →
                  </Link>
                </>
              ) : (
                <p className="text-[10px] text-gray-400">No cases match your filters.</p>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {loading
                ? Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className={`flex items-center gap-4 px-5 py-3 ${i < 4 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-200 shrink-0" />
                      <div className="flex-1 h-2.5 bg-gray-100 rounded animate-pulse" />
                      <div className="w-14 h-2 bg-gray-100 rounded animate-pulse" />
                    </div>
                  ))
                : filtered.map((c, i) => (
                    <CaseRow key={c.id} c={c} last={i === filtered.length - 1} />
                  ))
              }
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
