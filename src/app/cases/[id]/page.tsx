'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaseData {
  id:                   string
  title:                string
  type:                 string
  status:               string
  priority:             string
  source:               string
  description:          string | null
  reference_number:     string | null
  timeline_summary:     string | null
  assigned_to:          string | null
  created_at:           string
  updated_at:           string
  closed_at:            string | null
  pressure_score:       number | null
  pressure_level:       string | null
  pressure_reason:      string | null
  last_pressure_update: string | null
}

interface CaseInsight {
  id:             string
  insight_type:   string
  severity:       string
  title:          string
  description:    string
  why_it_matters: string
  recommendation: string
  evidence:       string | null
  confidence:     number
  created_at:     string
}

interface IntakeDoc {
  id:                string
  original_name:     string
  file_type:         string
  source:            string
  detected_category: string | null
  extracted_summary: string | null
  file_size:         number | null
  created_at:        string
}

interface EnrichedLink {
  id:          string
  entity_type: string
  entity_id:   string
  link_type:   string
  notes:       string | null
  created_at:  string
  entity_data: Record<string, unknown> | null
}

interface AuditEntry {
  id:          string
  action_type: string
  summary:     string | null
  status:      string
  created_at:  string
  duration_ms: number | null
}

interface CaseDetail {
  case:          CaseData
  documents:     IntakeDoc[]
  links:         EnrichedLink[]
  linked_counts: Record<string, number>
  audit:         AuditEntry[]
  insights:      CaseInsight[]
}

// ── Timeline entry — unified across all entity types ─────────────────────────

type TimelineEntryKind = 'document' | 'email' | 'approval' | 'workflow_suggestion' | 'workflow_run' | 'notification' | 'browser_run' | 'audit' | 'link_other'

interface TimelineEntry {
  id:       string
  kind:     TimelineEntryKind
  ts:       string   // ISO
  title:    string
  subtitle: string | null
  badge:    string
  badgeColor: string
  meta:     string | null
}

function entityToEntry(link: EnrichedLink): TimelineEntry {
  const d = link.entity_data
  const ts = (typeof d?.['created_at'] === 'string' ? d['created_at'] : null) ?? link.created_at

  switch (link.entity_type) {
    case 'email': return {
      id:         link.id,
      kind:       'email',
      ts,
      title:      (typeof d?.['subject'] === 'string' && d['subject']) ? d['subject'] : '(no subject)',
      subtitle:   typeof d?.['sender_email'] === 'string' ? d['sender_email'] : null,
      badge:      'Email',
      badgeColor: 'text-blue-400 bg-blue-500/[0.07] border-blue-500/15',
      meta:       link.notes,
    }
    case 'approval': return {
      id:         link.id,
      kind:       'approval',
      ts,
      title:      typeof d?.['title'] === 'string' ? d['title'] : 'Approval',
      subtitle:   typeof d?.['status'] === 'string' ? `Status: ${d['status']}` : null,
      badge:      'Approval',
      badgeColor: 'text-[#f59e0b] bg-[#f59e0b]/[0.07] border-[#f59e0b]/15',
      meta:       link.notes,
    }
    case 'inbox_workflow_suggestion': return {
      id:         link.id,
      kind:       'workflow_suggestion',
      ts,
      title:      typeof d?.['title'] === 'string' ? d['title'] : 'Workflow Suggestion',
      subtitle:   typeof d?.['suggestion_type'] === 'string' ? d['suggestion_type'] : null,
      badge:      'Suggestion',
      badgeColor: 'text-violet-400 bg-violet-500/[0.07] border-violet-500/15',
      meta:       link.notes,
    }
    case 'workflow_chain_run': return {
      id:         link.id,
      kind:       'workflow_run',
      ts,
      title:      typeof d?.['chain_name'] === 'string' ? d['chain_name'] : 'Workflow Run',
      subtitle:   typeof d?.['status'] === 'string' ? `Status: ${d['status']}` : null,
      badge:      'Workflow',
      badgeColor: 'text-[#22c55e] bg-[#22c55e]/[0.07] border-[#22c55e]/15',
      meta:       link.notes,
    }
    case 'notification': return {
      id:         link.id,
      kind:       'notification',
      ts,
      title:      typeof d?.['title'] === 'string' ? d['title'] : 'Notification',
      subtitle:   typeof d?.['body'] === 'string' ? d['body'] : null,
      badge:      'Notif',
      badgeColor: 'text-[#888] bg-[#111] border-[#1a1a1a]',
      meta:       null,
    }
    case 'browser_execution_run': return {
      id:         link.id,
      kind:       'browser_run',
      ts,
      title:      typeof d?.['task_description'] === 'string' ? d['task_description'] : 'Browser Run',
      subtitle:   typeof d?.['status'] === 'string' ? `Status: ${d['status']}` : null,
      badge:      'Browser',
      badgeColor: 'text-cyan-400 bg-cyan-500/[0.07] border-cyan-500/15',
      meta:       null,
    }
    default: return {
      id:         link.id,
      kind:       'link_other',
      ts,
      title:      link.entity_type.replace(/_/g, ' '),
      subtitle:   link.entity_id.slice(0, 12) + '…',
      badge:      link.link_type,
      badgeColor: 'text-[#555] bg-[#0f0f0f] border-[#1a1a1a]',
      meta:       link.notes,
    }
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
  open:             { dot: 'bg-[#22c55e]',               text: 'text-[#22c55e]',  bg: 'bg-[#22c55e]/[0.05]',  border: 'border-[#22c55e]/15', label: 'Open'             },
  in_progress:      { dot: 'bg-blue-500',                text: 'text-blue-400',   bg: 'bg-blue-500/[0.05]',   border: 'border-blue-500/15',  label: 'In Progress'      },
  pending_approval: { dot: 'bg-[#f59e0b] animate-pulse', text: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/[0.05]',  border: 'border-[#f59e0b]/15', label: 'Pending Approval' },
  resolved:         { dot: 'bg-[#555]',                  text: 'text-[#555]',    bg: 'bg-[#0f0f0f]',          border: 'border-[#1a1a1a]',    label: 'Resolved'         },
  closed:           { dot: 'bg-[#333]',                  text: 'text-[#444]',    bg: 'bg-[#0d0d0d]',          border: 'border-[#181818]',    label: 'Closed'           },
  archived:         { dot: 'bg-[#2a2a2a]',               text: 'text-[#3a3a3a]', bg: 'bg-[#090909]',          border: 'border-[#141414]',    label: 'Archived'         },
}

const PRIORITY_CFG: Record<string, { color: string }> = {
  critical: { color: 'text-red-400'   },
  high:     { color: 'text-[#f59e0b]' },
  medium:   { color: 'text-[#888]'    },
  low:      { color: 'text-[#555]'    },
}

const PRESSURE_CFG: Record<string, { color: string; bar: string; label: string; border: string; bg: string }> = {
  critical: { color: 'text-red-400',   bar: 'bg-red-500',   label: 'Critical', border: 'border-red-500/15',   bg: 'bg-red-500/[0.05]'   },
  elevated: { color: 'text-[#f59e0b]', bar: 'bg-[#f59e0b]', label: 'Elevated', border: 'border-[#f59e0b]/15', bg: 'bg-[#f59e0b]/[0.05]' },
  moderate: { color: 'text-[#888]',    bar: 'bg-[#555]',    label: 'Moderate', border: 'border-[#222]',       bg: 'bg-[#111]'           },
  low:      { color: 'text-[#22c55e]', bar: 'bg-[#22c55e]', label: 'Low',      border: 'border-[#22c55e]/10', bg: 'bg-[#22c55e]/[0.03]' },
}

const INSIGHT_SEV_CFG: Record<string, { color: string; dot: string; border: string }> = {
  critical: { color: 'text-red-400',   dot: 'bg-red-500 animate-pulse', border: 'border-red-500/15'   },
  high:     { color: 'text-[#f59e0b]', dot: 'bg-[#f59e0b]',             border: 'border-[#f59e0b]/15' },
  medium:   { color: 'text-[#888]',    dot: 'bg-[#555]',                 border: 'border-[#1e1e1e]'   },
  low:      { color: 'text-[#555]',    dot: 'bg-[#2a2a2a]',              border: 'border-[#161616]'   },
}

const FILE_TYPE_COLOR: Record<string, string> = {
  pdf: 'text-red-400', docx: 'text-blue-400', txt: 'text-[#888]',
  csv: 'text-[#22c55e]', image: 'text-violet-400', note: 'text-[#f59e0b]', other: 'text-[#555]',
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open:             ['in_progress', 'closed'],
  in_progress:      ['pending_approval', 'resolved', 'closed'],
  pending_approval: ['in_progress', 'resolved', 'closed'],
  resolved:         ['closed', 'open'],
  closed:           ['open'],
  archived:         [],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-[10.5px] font-semibold text-[#909090] uppercase tracking-[0.09em]">{title}</h2>
      {count !== undefined && (
        <span className="text-[8px] text-[#707070] bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const params   = useParams<{ id: string }>()
  const id       = params?.id ?? ''

  const [detail,       setDetail]       = useState<CaseDetail | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [updating,     setUpdating]     = useState(false)
  const [tab,          setTab]          = useState<'timeline' | 'documents' | 'audit' | 'insights'>('timeline')
  const [insightOpen,  setInsightOpen]  = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/cases/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetail(await res.json() as CaseDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const updateStatus = async (newStatus: string) => {
    if (!id || updating) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch { /* non-fatal */ } finally { setUpdating(false) }
  }

  const updatePriority = async (newPriority: string) => {
    if (!id || updating) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priority: newPriority }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch { /* non-fatal */ } finally { setUpdating(false) }
  }

  // ── Build unified chronological timeline ───────────────────────────────────
  const timeline: TimelineEntry[] = useMemo(() => {
    if (!detail) return []
    const entries: TimelineEntry[] = []

    // Intake documents (from case_id direct link)
    for (const doc of detail.documents) {
      entries.push({
        id:         doc.id,
        kind:       'document',
        ts:         doc.created_at,
        title:      doc.original_name,
        subtitle:   doc.detected_category ?? doc.source,
        badge:      doc.file_type.toUpperCase(),
        badgeColor: `${FILE_TYPE_COLOR[doc.file_type] ?? 'text-[#555]'} bg-[#111] border-[#1a1a1a]`,
        meta:       doc.extracted_summary ? doc.extracted_summary.slice(0, 80) : null,
      })
    }

    // All case_links (enriched)
    for (const link of detail.links) {
      entries.push(entityToEntry(link))
    }

    // Audit entries
    for (const a of detail.audit) {
      entries.push({
        id:         a.id,
        kind:       'audit',
        ts:         a.created_at,
        title:      a.summary ?? a.action_type,
        subtitle:   a.action_type,
        badge:      'Audit',
        badgeColor: a.status === 'completed' ? 'text-[#22c55e]/70 bg-[#22c55e]/[0.04] border-[#22c55e]/10'
                    : a.status === 'failed'  ? 'text-red-400/70 bg-red-500/[0.04] border-red-500/10'
                    : 'text-[#666] bg-[#0f0f0f] border-[#1a1a1a]',
        meta:       a.duration_ms ? `${a.duration_ms}ms` : null,
      })
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    return entries
  }, [detail])

  // ── Health counters ────────────────────────────────────────────────────────
  const pendingApprovals = detail?.links.filter(l =>
    l.entity_type === 'approval' &&
    (l.entity_data?.['status'] === 'pending' || l.entity_data?.['status'] === 'requested')
  ).length ?? 0

  const notificationWarnings = detail?.links.filter(l =>
    l.entity_type === 'notification' && l.entity_data?.['dismissed'] === false
  ).length ?? 0

  const activeWorkflows = detail?.links.filter(l =>
    l.entity_type === 'workflow_chain_run' &&
    !['completed', 'failed', 'cancelled'].includes((l.entity_data?.['status'] as string) ?? '')
  ).length ?? 0

  if (loading) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <span className="text-[10px] text-[#444] animate-pulse">Loading case…</span>
    </div>
  )

  if (error || !detail) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[11px] text-red-400">{error ?? 'Case not found'}</p>
        <Link href="/cases" className="text-[9px] text-[#555] mt-3 inline-block hover:text-[#888] transition-colors">← Back to Cases</Link>
      </div>
    </div>
  )

  const { case: c, documents, linked_counts, insights } = detail
  const scfg      = STATUS_CFG[c.status]     ?? STATUS_CFG.open
  const pcfg      = PRIORITY_CFG[c.priority] ?? PRIORITY_CFG.medium
  const transitions = STATUS_TRANSITIONS[c.status] ?? []

  return (
    <div className="min-h-screen bg-[#080808]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-[#131313] bg-[#080808]/96 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <Link href="/cases" className="text-[9px] text-[#555] hover:text-[#888] transition-colors shrink-0">← Cases</Link>
        <div className="w-px h-4 bg-[#1a1a1a]" />
        <div className={`flex items-center gap-1.5 text-[9px] px-2 py-1 rounded-lg border ${scfg.bg} ${scfg.border}`}>
          <span className={`w-1 h-1 rounded-full ${scfg.dot}`} />
          <span className={scfg.text}>{scfg.label}</span>
        </div>
        <p className="text-[10px] font-semibold text-[#d0d0d0] truncate flex-1 min-w-0">{c.title}</p>
        {c.reference_number && (
          <span className="text-[8px] text-[#555] font-mono shrink-0">{c.reference_number}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <select
            value={c.priority}
            onChange={e => void updatePriority(e.target.value)}
            disabled={updating}
            className={`text-[8.5px] border border-[#222] px-2 py-1.5 rounded-lg bg-[#0a0a0a] hover:border-[#333] transition-colors disabled:opacity-40 cursor-pointer focus:outline-none appearance-none ${PRIORITY_CFG[c.priority]?.color ?? 'text-[#666]'}`}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          {transitions.map(s => (
            <button
              key={s}
              onClick={() => void updateStatus(s)}
              disabled={updating}
              className="text-[8.5px] text-[#666] border border-[#222] px-2.5 py-1.5 rounded-lg hover:text-[#bbb] hover:border-[#333] transition-colors disabled:opacity-40 capitalize"
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1000px] mx-auto space-y-4">

        {/* ── Meta strip ──────────────────────────────────────────────── */}
        <div className="flex items-stretch bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden divide-x divide-[#181818]">
          {[
            { label: 'Type',     value: c.type.replace(/_/g, ' '), color: 'text-[#888]'    },
            { label: 'Priority', value: c.priority,                color: pcfg.color        },
            { label: 'Source',   value: c.source,                  color: 'text-[#888]'    },
            { label: 'Docs',     value: documents.length,          color: documents.length > 0 ? 'text-[#c0c0c0]' : 'text-[#2a2a2a]' },
            { label: 'Links',    value: Object.values(linked_counts).reduce((s, n) => s + n, 0),
              color: 'text-[#c0c0c0]' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col gap-1 px-4 py-3.5 flex-1">
              <p className={`text-[20px] font-bold leading-none capitalize tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-[#7a7a7a] tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Health indicators ────────────────────────────────────────── */}
        {(pendingApprovals > 0 || notificationWarnings > 0 || activeWorkflows > 0) && (
          <div className="flex gap-2 flex-wrap">
            {pendingApprovals > 0 && (
              <div className="flex items-center gap-1.5 text-[8.5px] text-[#f59e0b] bg-[#f59e0b]/[0.06] border border-[#f59e0b]/15 px-2.5 py-1.5 rounded-lg">
                <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-pulse" />
                {pendingApprovals} pending approval{pendingApprovals > 1 ? 's' : ''}
              </div>
            )}
            {activeWorkflows > 0 && (
              <div className="flex items-center gap-1.5 text-[8.5px] text-[#22c55e] bg-[#22c55e]/[0.05] border border-[#22c55e]/15 px-2.5 py-1.5 rounded-lg">
                <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
                {activeWorkflows} active workflow{activeWorkflows > 1 ? 's' : ''}
              </div>
            )}
            {notificationWarnings > 0 && (
              <div className="flex items-center gap-1.5 text-[8.5px] text-[#888] bg-[#111] border border-[#1a1a1a] px-2.5 py-1.5 rounded-lg">
                <span className="w-1 h-1 rounded-full bg-[#666]" />
                {notificationWarnings} undismissed notification{notificationWarnings > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* ── Pressure score ───────────────────────────────────────────── */}
        {c.pressure_score !== null && c.pressure_level && (() => {
          const pcfg = PRESSURE_CFG[c.pressure_level] ?? PRESSURE_CFG.low
          return (
            <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${pcfg.bg} ${pcfg.border}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[8.5px] font-semibold uppercase tracking-wide ${pcfg.color}`}>{pcfg.label} Pressure</span>
                  <span className={`text-[8px] font-mono tabular-nums ${pcfg.color}`}>{c.pressure_score}/100</span>
                </div>
                <div className="h-1 bg-[#111] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pcfg.bar}`} style={{ width: `${c.pressure_score}%` }} />
                </div>
                {c.pressure_reason && (
                  <p className="text-[7.5px] text-[#555] mt-1.5">{c.pressure_reason}</p>
                )}
              </div>
              {insights.length > 0 && (
                <button
                  onClick={() => setTab('insights')}
                  className="shrink-0 text-[7.5px] text-[#555] hover:text-[#888] transition-colors border border-[#1e1e1e] px-2 py-1 rounded-lg"
                >
                  {insights.length} insight{insights.length !== 1 ? 's' : ''} →
                </button>
              )}
              <Link
                href="/operational-intelligence"
                className="shrink-0 text-[7px] text-[#444] hover:text-[#666] transition-colors border border-[#1a1a1a] px-1.5 py-1 rounded-lg"
              >
                Intel →
              </Link>
            </div>
          )
        })()}

        {/* ── Description ─────────────────────────────────────────────── */}
        {c.description && (
          <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl px-5 py-4">
            <p className="text-[9.5px] text-[#8a8a8a] leading-relaxed">{c.description}</p>
          </div>
        )}

        {/* ── Tab nav ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-[#0a0a0a] border border-[#161616] rounded-xl p-1 w-fit">
          {([['timeline', 'Timeline', timeline.length], ['documents', 'Documents', documents.length], ['audit', 'Audit', detail.audit.length], ['insights', 'Insights', detail.insights.length]] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-[9px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === key ? 'bg-[#181818] text-[#c0c0c0]' : 'text-[#555] hover:text-[#888]'
              }`}
            >
              {label}
              <span className={`text-[8px] tabular-nums ${tab === key ? 'text-[#888]' : 'text-[#333]'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* ── Timeline tab ────────────────────────────────────────────── */}
        {tab === 'timeline' && (
          <section>
            {timeline.length === 0 ? (
              <div className="text-center py-10 bg-[#0a0a0a] border border-[#151515] rounded-2xl">
                <p className="text-[10px] text-[#444]">No timeline events yet.</p>
                <p className="text-[8.5px] text-[#333] mt-1.5">Documents, emails, approvals, and workflow events will appear here once linked.</p>
              </div>
            ) : (
              <div className="relative">
                {/* vertical track */}
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#141414]" />
                <div className="space-y-0">
                  {timeline.map((entry, i) => (
                    <div key={entry.id} className={`flex gap-4 group relative ${i < timeline.length - 1 ? 'pb-3' : ''}`}>
                      {/* dot */}
                      <div className="z-10 w-10 shrink-0 flex items-start justify-center pt-[13px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1f1f1f] border border-[#2a2a2a] group-hover:border-[#3a3a3a] transition-colors" />
                      </div>
                      {/* card */}
                      <div className="flex-1 min-w-0 bg-[#0a0a0a] border border-[#131313] rounded-xl px-4 py-3 hover:border-[#1c1c1c] transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[9.5px] text-[#c0c0c0] truncate leading-tight">{entry.title}</p>
                            {entry.subtitle && (
                              <p className="text-[8px] text-[#555] truncate mt-0.5">{entry.subtitle}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2 ml-2">
                            <span className={`text-[7.5px] px-1.5 py-0.5 rounded border ${entry.badgeColor}`}>{entry.badge}</span>
                            {entry.meta && (
                              <span className="text-[7px] text-[#444] font-mono">{entry.meta}</span>
                            )}
                            <span className="text-[7.5px] text-[#333] tabular-nums whitespace-nowrap">{fmtTime(entry.ts)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Documents tab ───────────────────────────────────────────── */}
        {tab === 'documents' && (
          <section>
            <SectionHeader title="Documents" count={documents.length} />
            {documents.length === 0 ? (
              <div className="text-center py-8 bg-[#0a0a0a] border border-[#161616] rounded-2xl">
                <p className="text-[10px] text-[#444]">No documents attached.</p>
                <Link href="/intake" className="text-[9px] text-[#555] mt-2 inline-block hover:text-[#888] transition-colors">Upload a document →</Link>
              </div>
            ) : (
              <div className="bg-[#0a0a0a] border border-[#151515] rounded-2xl overflow-hidden">
                {documents.map((doc, i) => (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${i < documents.length - 1 ? 'border-b border-[#0f0f0f]' : ''} hover:bg-[#0e0e0e] transition-colors`}
                  >
                    <span className={`text-[8px] font-mono font-bold uppercase w-8 shrink-0 ${FILE_TYPE_COLOR[doc.file_type] ?? 'text-[#555]'}`}>{doc.file_type}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9.5px] text-[#c0c0c0] truncate">{doc.original_name}</p>
                      {doc.extracted_summary && <p className="text-[7.5px] text-[#555] truncate mt-0.5">{doc.extracted_summary}</p>}
                    </div>
                    {doc.file_size && <span className="text-[7.5px] text-[#444] shrink-0">{formatBytes(doc.file_size)}</span>}
                    <span className="text-[7.5px] text-[#444] tabular-nums shrink-0">{relativeTime(doc.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Audit tab ───────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <section>
            <SectionHeader title="Audit Trail" count={detail.audit.length} />
            {detail.audit.length === 0 ? (
              <div className="text-center py-8 bg-[#0a0a0a] border border-[#161616] rounded-2xl">
                <p className="text-[10px] text-[#444]">No audit events recorded.</p>
              </div>
            ) : (
              <div className="bg-[#0a0a0a] border border-[#151515] rounded-2xl overflow-hidden">
                {detail.audit.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2 ${i < detail.audit.length - 1 ? 'border-b border-[#0f0f0f]' : ''} hover:bg-[#0e0e0e] transition-colors`}
                  >
                    <span className={`w-1 h-1 rounded-full shrink-0 ${
                      entry.status === 'completed' ? 'bg-[#22c55e]'
                      : entry.status === 'failed'  ? 'bg-red-500'
                      : 'bg-[#f59e0b]'
                    }`} />
                    <span className="text-[8.5px] font-mono text-[#666] shrink-0 w-40 truncate">{entry.action_type}</span>
                    <span className="flex-1 text-[9px] text-[#888] truncate">{entry.summary}</span>
                    {entry.duration_ms && <span className="text-[7.5px] text-[#444] font-mono shrink-0">{entry.duration_ms}ms</span>}
                    <span className="text-[7.5px] text-[#444] tabular-nums shrink-0">{relativeTime(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Insights tab ────────────────────────────────────────────── */}
        {tab === 'insights' && (
          <section>
            <SectionHeader title="Operational Insights" count={insights.length} />
            {insights.length === 0 ? (
              <div className="text-center py-8 bg-[#0a0a0a] border border-[#161616] rounded-2xl">
                <p className="text-[10px] text-[#444]">No active insights for this case.</p>
                <Link href="/operational-intelligence" className="text-[9px] text-[#555] mt-2 inline-block hover:text-[#888] transition-colors">Run intelligence engine →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {insights.map(ins => {
                  const scfg    = INSIGHT_SEV_CFG[ins.severity] ?? INSIGHT_SEV_CFG.medium
                  const isOpen  = insightOpen === ins.id
                  return (
                    <div key={ins.id} className={`bg-[#0a0a0a] border ${scfg.border} rounded-xl overflow-hidden`}>
                      <button
                        onClick={() => setInsightOpen(isOpen ? null : ins.id)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#0e0e0e] transition-colors"
                      >
                        <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${scfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9.5px] font-medium text-[#c0c0c0] leading-snug">{ins.title}</p>
                          <p className="text-[8px] text-[#555] mt-0.5 truncate">{ins.description}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2 ml-2">
                          <span className={`text-[7.5px] ${scfg.color}`}>{ins.severity}</span>
                          <span className="text-[7.5px] text-[#333] tabular-nums">{ins.confidence}%</span>
                          <span className="text-[7.5px] text-[#333]">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#111] px-4 py-3 space-y-3">
                          <div>
                            <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Why it matters</p>
                            <p className="text-[8.5px] text-[#777] leading-relaxed">{ins.why_it_matters}</p>
                          </div>
                          {ins.evidence && (
                            <div>
                              <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Evidence</p>
                              <p className="text-[8px] text-[#666] font-mono leading-relaxed bg-[#0d0d0d] border border-[#181818] rounded-lg px-3 py-2">{ins.evidence}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[7.5px] font-semibold text-[#505050] uppercase tracking-wide mb-1">Recommendation</p>
                            <p className="text-[8.5px] text-[#22c55e]/80 leading-relaxed">{ins.recommendation}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-[8px] text-[#2a2a2a] py-2">
          <span>Created {relativeTime(c.created_at)}</span>
          {c.timeline_summary && <span className="text-[#1e1e1e] italic max-w-sm truncate">{c.timeline_summary}</span>}
          <span>Updated {relativeTime(c.updated_at)}</span>
        </div>
      </main>
    </div>
  )
}
