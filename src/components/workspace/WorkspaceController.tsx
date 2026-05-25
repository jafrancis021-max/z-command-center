'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  isWorkspaceMode,
  PRIMARY_ACTIONS,
  type WorkspaceMode,
} from '@/lib/workspace-state'

// ── Shared helpers ────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Back bar ──────────────────────────────────────────────────────────────────

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10.5px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2L4 6l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Dashboard
      </button>
      <span className="text-gray-300 text-[10px]">/</span>
      <span className="text-[11px] font-semibold text-gray-700">{label}</span>
    </div>
  )
}

// ── Panel shell ───────────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {children}
    </div>
  )
}

// ── STATUS PILL ───────────────────────────────────────────────────────────────

function StatusPill({
  status, labels,
}: {
  status: 'idle' | 'loading' | 'success' | 'error'
  labels: { loading: string; success: string; error: string }
}) {
  if (status === 'idle') return null
  const colors = {
    loading: 'bg-blue-50 border-blue-200 text-blue-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    error:   'bg-red-50 border-red-200 text-red-700',
  }
  const text = labels[status as keyof typeof labels]
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-medium ${colors[status as keyof typeof colors]}`}>
      {status === 'loading' && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {text}
    </div>
  )
}

// ── PANEL: Dashboard Home ─────────────────────────────────────────────────────

function DashboardHomePanel({ navigate }: { navigate: (m: WorkspaceMode) => void }) {
  return (
    <div className="text-center max-w-md">
      <h1 className="text-[22px] font-bold text-gray-900 mb-2">Z Command Center</h1>
      <p className="text-[13px] text-gray-400 leading-relaxed mb-8">
        Choose an action below or ask Z for guidance.
      </p>

      {/* Primary workspace actions */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        {PRIMARY_ACTIONS.map(action => (
          <button
            key={action.mode}
            onClick={() => navigate(action.mode)}
            className={`flex items-center gap-4 w-full px-5 py-4 rounded-xl border text-left transition-all ${action.color}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold leading-none mb-1">{action.label}</p>
              <p className="text-[10.5px] opacity-70 leading-none">{action.desc}</p>
            </div>
            <svg className="w-4 h-4 shrink-0 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <Link
        href="/launch-checklist"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:border-gray-300 hover:shadow-sm transition-all"
      >
        Open Launch Checklist
        <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  )
}

// ── PANEL: Vault Upload ───────────────────────────────────────────────────────

function VaultUploadPanel({ onBack }: { onBack: () => void }) {
  const [tab,    setTab]    = useState<'file' | 'note'>('file')
  const [file,   setFile]   = useState<File | null>(null)
  const [title,  setTitle]  = useState('')
  const [note,   setNote]   = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [drag,   setDrag]   = useState(false)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }, [title])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  async function submit() {
    if (status === 'loading') return
    setStatus('loading')

    try {
      if (tab === 'file' && file) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/intake/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('Upload failed')
      } else if (tab === 'note') {
        if (!note.trim()) { setStatus('idle'); return }
        const res = await fetch('/api/intake', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: title || 'Manual note', content: note }),
        })
        if (!res.ok) throw new Error('Note save failed')
      } else {
        setStatus('idle')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <PanelShell>
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Add to Vault" onBack={onBack} />
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(['file', 'note'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'file' ? 'Upload File' : 'Add Note'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {tab === 'file' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('ws-file-input')?.click()}
              className={`flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                drag
                  ? 'border-blue-400 bg-blue-50'
                  : file
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
              </svg>
              <div className="text-center">
                {file ? (
                  <p className="text-[11.5px] font-semibold text-green-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-[11.5px] font-medium text-gray-600">Drop a file or click to browse</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">PDF, images, text — up to 50 MB</p>
                  </>
                )}
              </div>
              <input
                id="ws-file-input"
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>
          </>
        )}

        {tab === 'note' && (
          <>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Note title (optional)"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[11.5px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Write your note here…"
              rows={5}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[11.5px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
            />
          </>
        )}

        <StatusPill
          status={status}
          labels={{ loading: 'Saving to vault…', success: 'Added to vault successfully.', error: 'Something went wrong. Try again.' }}
        />

        {status !== 'success' && (
          <button
            onClick={() => { void submit() }}
            disabled={status === 'loading' || (tab === 'file' && !file) || (tab === 'note' && !note.trim())}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {tab === 'file' ? 'Upload to Vault' : 'Save Note'}
          </button>
        )}

        {status === 'success' && (
          <div className="flex gap-2">
            <button
              onClick={() => { setFile(null); setNote(''); setTitle(''); setStatus('idle') }}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Add Another
            </button>
            <Link
              href="/vault"
              className="flex-1 py-3 bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold rounded-xl hover:bg-blue-100 transition-colors text-center"
            >
              Open Vault →
            </Link>
          </div>
        )}
      </div>
    </PanelShell>
  )
}

// ── PANEL: Workflow Run ───────────────────────────────────────────────────────

interface WorkflowTemplate {
  id:          string
  name:        string
  description: string | null
  category:    string
  enabled:     boolean
}

function WorkflowRunPanel({ onBack }: { onBack: () => void }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState<string | null>(null)
  const [done,      setDone]      = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/workflows/templates')
      .then(r => r.ok ? r.json() : [])
      .then((d: unknown) => { setTemplates(Array.isArray(d) ? d as WorkflowTemplate[] : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function runTemplate(id: string, name: string) {
    setRunning(id)
    setError(null)
    try {
      const res = await fetch('/api/workflows/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ template_id: id }),
      })
      if (!res.ok) throw new Error('Run failed')
      setDone(name)
    } catch {
      setError(`Failed to run "${name}"`)
    } finally {
      setRunning(null)
    }
  }

  return (
    <PanelShell>
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Run Workflow" onBack={onBack} />
        <p className="text-[11px] text-gray-500">Select a workflow template to execute.</p>
      </div>

      <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
            <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            Loading templates…
          </div>
        )}

        {!loading && templates.length === 0 && (
          <div className="py-10 text-center text-[11px] text-gray-400">
            No workflow templates found.
            <Link href="/workflows" className="block mt-2 text-blue-600 hover:text-blue-700 font-semibold">
              Go to Workflows →
            </Link>
          </div>
        )}

        {templates.map(t => (
          <div key={t.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-semibold text-gray-800 leading-none mb-1">{t.name}</p>
              {t.description && (
                <p className="text-[10px] text-gray-500 leading-relaxed">{t.description.slice(0, 90)}</p>
              )}
              <span className="inline-block mt-1.5 text-[9px] font-medium text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                {t.category}
              </span>
            </div>
            <button
              onClick={() => { void runTemplate(t.id, t.name) }}
              disabled={running === t.id}
              className="shrink-0 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[10.5px] font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {running === t.id ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : '▶'}
              Run
            </button>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 space-y-2">
        {done && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-[11px] font-medium">
            ✓ Workflow &quot;{done}&quot; completed.
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-[11px]">
            {error}
          </div>
        )}
        <Link
          href="/workflows"
          className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          Manage all workflows →
        </Link>
      </div>
    </PanelShell>
  )
}

// ── PANEL: Events View ────────────────────────────────────────────────────────

interface OpsEvent {
  id:               string
  event_type:       string
  event_source:     string
  title:            string
  description:      string | null
  memory_mode:      string
  temperature_tier: string
  importance_score: number
  created_at:       string
}

const TIER_DOT: Record<string, string> = {
  hot:  'bg-red-400',
  warm: 'bg-amber-400',
  cold: 'bg-blue-300',
}

function EventsViewPanel({ onBack }: { onBack: () => void }) {
  const [events,  setEvents]  = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/debug/events?limit=20')
      .then(r => r.ok ? r.json() : { events: [] })
      .then((d: { events?: OpsEvent[]; event_types?: Record<string, number> }) => {
        setEvents(d.events ?? [])
        setSummary(d.event_types ?? {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <PanelShell>
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Operational Events" onBack={onBack} />
        {Object.keys(summary).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary).map(([type, count]) => (
              <span key={type} className="text-[9.5px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded-lg">
                {type.replace('.', ' · ')} ({count})
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto scrollbar-thin divide-y divide-gray-100">
        {loading && (
          <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
            <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            Loading events…
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="py-10 text-center text-[11px] text-gray-400">
            No events yet. Trigger an action to generate events.
          </div>
        )}

        {events.map(e => (
          <div key={e.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
            <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TIER_DOT[e.temperature_tier] ?? 'bg-gray-300'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-gray-800 leading-snug truncate">{e.title}</p>
              {e.description && (
                <p className="text-[9.5px] text-gray-400 leading-relaxed mt-0.5 line-clamp-1">{e.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-gray-400">{e.event_type.replace('.', ' · ')}</span>
                <span className="text-[9px] text-gray-300">·</span>
                <span className="text-[9px] text-gray-400">{e.memory_mode}</span>
                <span className="text-[9px] text-gray-300">·</span>
                <span className="text-[9px] text-gray-400">{timeAgo(e.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-gray-100">
        <button
          onClick={() => {
            setLoading(true)
            fetch('/api/debug/events?limit=20')
              .then(r => r.json())
              .then((d: { events?: OpsEvent[] }) => { setEvents(d.events ?? []); setLoading(false) })
              .catch(() => setLoading(false))
          }}
          className="w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>
    </PanelShell>
  )
}

// ── PANEL: Memory Debug (retrieval telemetry) ────────────────────────────────

interface TelemetryRow {
  id:                    string
  created_at:            string
  title:                 string
  intent:                string
  item_count:            number
  workspace_scoped_count: number
  global_fallback_count:  number
  speculative_blocked:    boolean
  top_memory_score:       number
  selected_modes:         string[]
  user_message_preview:   string
}

interface TelemetrySummary {
  total_retrievals:          number
  counts_by_intent:          Record<string, number>
  speculative_blocked_count: number
  avg_top_memory_score:      number
  workspace_pct:             number
  global_pct:                number
  top_modes:                 Array<{ mode: string; count: number }>
}

interface TelemetryResponse {
  checked_at: string
  total:      number
  summary:    TelemetrySummary
  recent:     TelemetryRow[]
}

const INTENT_CHIP: Record<string, string> = {
  working:    'bg-blue-100 text-blue-700',
  episodic:   'bg-purple-100 text-purple-700',
  semantic:   'bg-amber-100 text-amber-700',
  procedural: 'bg-green-100 text-green-700',
  runtime:    'bg-red-100 text-red-700',
  speculative: 'bg-gray-100 text-gray-500',
}

function MemoryDebugPanel({ onBack }: { onBack: () => void }) {
  const [data,    setData]    = useState<TelemetryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/debug/retrieval-telemetry?limit=50')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((d: TelemetryResponse) => { setData(d); setLoading(false) })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load telemetry')
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  return (
    <PanelShell>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Memory Debug" onBack={onBack} />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">Retrieval telemetry from assistant chat.</p>
          <button
            onClick={load}
            disabled={loading}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
          <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Loading telemetry…
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-6 text-[11px] text-red-600">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-gray-100">
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[18px] font-bold text-gray-900">{data.summary.total_retrievals}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Total</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[18px] font-bold text-gray-900">{data.summary.avg_top_memory_score}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Avg Score</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[18px] font-bold text-gray-900">{data.summary.speculative_blocked_count}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Spec. Blocked</p>
            </div>
          </div>

          {/* Intent breakdown + scope */}
          {data.summary.total_retrievals > 0 && (
            <div className="px-6 py-4 border-b border-gray-100 space-y-3">
              <div>
                <p className="text-[9.5px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Intents</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.summary.counts_by_intent).map(([intent, count]) => (
                    <span
                      key={intent}
                      className={`text-[9.5px] font-medium px-2 py-0.5 rounded-full ${INTENT_CHIP[intent] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {intent} ({count})
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[10px] text-gray-600">Workspace {data.summary.workspace_pct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-[10px] text-gray-600">Global {data.summary.global_pct}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent retrievals */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
            {data.recent.length === 0 ? (
              <div className="px-6 py-8 text-center text-[11px] text-gray-400">
                No retrievals yet. Send a chat message to generate telemetry.
              </div>
            ) : data.recent.map(row => (
              <div key={row.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className={`mt-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0 ${INTENT_CHIP[row.intent] ?? 'bg-gray-100 text-gray-500'}`}>
                  {row.intent}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-700 leading-snug truncate">
                    {row.user_message_preview || row.title}
                  </p>
                  <div className="flex items-center flex-wrap gap-2 mt-1">
                    <span className="text-[9px] text-gray-400">{row.item_count} items</span>
                    <span className="text-[9px] text-gray-300">·</span>
                    <span className="text-[9px] text-gray-400">ws={row.workspace_scoped_count}</span>
                    <span className="text-[9px] text-gray-300">·</span>
                    <span className="text-[9px] text-gray-400">score={Math.round(row.top_memory_score)}</span>
                    {row.speculative_blocked && (
                      <>
                        <span className="text-[9px] text-gray-300">·</span>
                        <span className="text-[9px] text-amber-500">spec. blocked</span>
                      </>
                    )}
                    <span className="text-[9px] text-gray-300">·</span>
                    <span className="text-[9px] text-gray-400">{timeAgo(row.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100">
            <Link
              href="/api/debug/retrieval-telemetry"
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              View raw JSON →
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  )
}

// ── PANEL: Operational Replay ─────────────────────────────────────────────────

interface ReplayEventRow {
  id:               string
  created_at:       string
  event_type:       string
  event_source:     string
  entity_type:      string | null
  entity_id:        string | null
  title:            string
  description:      string | null
  memory_mode:      string
  temperature_tier: string
  importance_score: number
}

interface ReplayDay {
  date:   string
  label:  string
  events: ReplayEventRow[]
}

interface ReplaySummary {
  total_events:      number
  first_event_at:    string | null
  latest_event_at:   string | null
  duration_days:     number | null
  event_type_counts: Record<string, number>
}

interface ReplayResponse {
  checked_at:  string
  workspace_id: string | null
  events:      ReplayEventRow[]
  grouped:     ReplayDay[]
  summary:     ReplaySummary
  explanation: string[]
}

const SOURCE_COLOR: Record<string, string> = {
  assistant: 'text-blue-600',
  vault:     'text-indigo-600',
  workflow:  'text-violet-600',
  system:    'text-gray-500',
}

function ReplayPanel({ onBack }: { onBack: () => void }) {
  const [data,    setData]    = useState<ReplayResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/debug/replay?limit=50')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((d: ReplayResponse) => { setData(d); setLoading(false) })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load replay')
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  return (
    <PanelShell>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Operational Replay" onBack={onBack} />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">Chronological record of what happened.</p>
          <button
            onClick={load}
            disabled={loading}
            className="text-[10px] text-orange-600 hover:text-orange-800 font-medium disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
          <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
          Loading replay…
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-6 text-[11px] text-red-600">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-gray-100">
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[18px] font-bold text-gray-900">{data.summary.total_events}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Events</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[13px] font-bold text-gray-900 leading-tight">
                {data.summary.first_event_at ? timeAgo(data.summary.first_event_at) : '—'}
              </p>
              <p className="text-[9px] text-gray-400 mt-0.5">First Event</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className="text-[13px] font-bold text-gray-900 leading-tight">
                {data.summary.latest_event_at ? timeAgo(data.summary.latest_event_at) : '—'}
              </p>
              <p className="text-[9px] text-gray-400 mt-0.5">Latest</p>
            </div>
          </div>

          {/* Event type breakdown */}
          {Object.keys(data.summary.event_type_counts).length > 0 && (
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
              {Object.entries(data.summary.event_type_counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([type, count]) => (
                <span key={type} className="text-[9px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                  {type.replace('.', ' · ')} ({count})
                </span>
              ))}
            </div>
          )}

          {/* Grouped timeline */}
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {data.grouped.length === 0 ? (
              <div className="px-6 py-8 text-center text-[11px] text-gray-400">
                No events yet. Trigger uploads, workflows, or chat to generate events.
              </div>
            ) : data.grouped.map(day => (
              <div key={day.date}>
                {/* Day separator */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-1.5 z-10">
                  <span className="text-[9.5px] font-semibold text-gray-400 uppercase tracking-wider">
                    {day.label}
                  </span>
                </div>

                {day.events.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT[ev.temperature_tier] ?? 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] font-medium text-gray-800 leading-snug line-clamp-1">
                        {ev.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-[9px] font-medium ${SOURCE_COLOR[ev.event_source] ?? 'text-gray-400'}`}>
                          {ev.event_type.replace('.', ' · ')}
                        </span>
                        {ev.entity_type && (
                          <>
                            <span className="text-[9px] text-gray-300">·</span>
                            <span className="text-[9px] text-gray-400">{ev.entity_type}</span>
                          </>
                        )}
                        <span className="text-[9px] text-gray-300">·</span>
                        <span className="text-[9px] text-gray-400">{timeAgo(ev.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100">
            <Link
              href="/api/debug/replay"
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              View raw JSON →
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  )
}

// ── PANEL: Procedural Patterns ────────────────────────────────────────────────

interface ProceduralPattern {
  id:                 string
  pattern_name:       string
  pattern_summary:    string
  detected_sequence:  string[]
  confidence_score:   number
  occurrence_count:   number
  last_detected_at:   string
  suggested_use_case: string | null
}

interface PatternsResponse {
  patterns:    ProceduralPattern[]
  count:       number
  workspaceId: string
}

function ProceduralPatternsPanel({ onBack }: { onBack: () => void }) {
  const [data,      setData]      = useState<PatternsResponse | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/debug/procedural-patterns')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((d: PatternsResponse) => { setData(d); setLoading(false) })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load patterns')
        setLoading(false)
      })
  }

  async function runDetection() {
    setDetecting(true)
    setError(null)
    try {
      const res = await fetch('/api/debug/procedural-patterns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ windowSize: 3, eventLimit: 200 }),
      })
      if (!res.ok) throw new Error('Detection failed')
      const detected = await res.json() as { count: number }
      await new Promise<void>(resolve => {
        fetch('/api/debug/procedural-patterns')
          .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
          .then((d: PatternsResponse) => { setData(d); resolve() })
          .catch(() => resolve())
      })
      if (detected.count === 0) setError('No repeated sequences found in recent events.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <PanelShell>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Procedural Patterns" onBack={onBack} />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">Repeated sequences Z has detected.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={loading || detecting}
              className="text-[10px] text-teal-600 hover:text-teal-800 font-medium disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
          <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-teal-500 rounded-full animate-spin" />
          Loading patterns…
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-4 text-[11px] text-amber-600 bg-amber-50 border-b border-amber-100">{error}</div>
      )}

      {!loading && data && (
        <>
          {/* Summary */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="bg-teal-50 rounded-xl p-4 border border-teal-100 text-center">
              <p className="text-[22px] font-bold text-teal-700">{data.count}</p>
              <p className="text-[9.5px] text-teal-500 font-medium mt-0.5">Patterns Stored</p>
            </div>
          </div>

          {/* Patterns list */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
            {data.patterns.length === 0 ? (
              <div className="px-6 py-8 text-center text-[11px] text-gray-400">
                No patterns yet. Click &quot;Run Detection&quot; below to scan recent events.
              </div>
            ) : data.patterns.map(p => (
              <div key={p.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 leading-snug">{p.pattern_name}</p>
                    <p className="text-[9.5px] text-gray-500 mt-0.5">{p.pattern_summary}</p>
                    {p.suggested_use_case && (
                      <p className="text-[9px] text-teal-600 mt-1 italic">{p.suggested_use_case}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[9px] font-medium text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                        {(p.confidence_score * 100).toFixed(0)}% confidence
                      </span>
                      <span className="text-[9px] text-gray-400">{p.occurrence_count}× seen</span>
                      <span className="text-[9px] text-gray-300">·</span>
                      <span className="text-[9px] text-gray-400">{timeAgo(p.last_detected_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.detected_sequence.map((s, i) => (
                        <span key={i} className="text-[8.5px] font-mono text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => { void runDetection() }}
              disabled={detecting || loading}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold rounded-xl transition-colors disabled:opacity-40"
            >
              {detecting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Detecting…
                </>
              ) : 'Run Detection'}
            </button>
            <Link
              href="/api/debug/procedural-patterns"
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              View raw JSON →
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  )
}

// ── PANEL: Workflow Learning ──────────────────────────────────────────────────

interface LearningSignalRow {
  id:              string
  created_at:      string
  signal_type:     string
  signal_source:   string
  signal_strength: number
  pattern_id:      string | null
  notes:           string | null
}

interface LearningSummaryData {
  total_signals:    number
  counts_by_type:   Record<string, number>
  positive_signals: number
  negative_signals: number
  learning_score:   number
}

interface LearningLoopResponse {
  checked_at:             string
  workspaceId:            string
  signals:                LearningSignalRow[]
  summary:                LearningSummaryData
  learning_score:         number
  suggested_improvements: string[]
  top_pattern_ids:        string[]
}

const SIGNAL_COLOR: Record<string, string> = {
  pattern_detected:            'bg-teal-400',
  pattern_reinforced:          'bg-emerald-400',
  user_viewed_pattern:         'bg-blue-300',
  workflow_completed:          'bg-green-400',
  workflow_repeated:           'bg-green-300',
  user_approved_procedure:     'bg-emerald-500',
  assistant_suggested_procedure: 'bg-indigo-400',
  workflow_failed:             'bg-red-400',
  user_rejected_procedure:     'bg-red-300',
  user_ignored_suggestion:     'bg-amber-300',
}

function LearningScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500 font-medium">Learning Score</span>
        <span className="text-[13px] font-bold text-gray-800">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function WorkflowLearningPanel({ onBack }: { onBack: () => void }) {
  const [data,    setData]    = useState<LearningLoopResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/debug/workflow-learning')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((d: LearningLoopResponse) => { setData(d); setLoading(false) })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load learning data')
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  return (
    <PanelShell>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label="Workflow Learning" onBack={onBack} />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">How Z is learning from operational patterns.</p>
          <button
            onClick={load}
            disabled={loading}
            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-[11px] text-gray-400 gap-2">
          <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
          Loading learning data…
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-6 text-[11px] text-red-600">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Score + stats */}
          <div className="px-6 py-4 border-b border-gray-100 space-y-4">
            <LearningScoreBar score={data.learning_score} />
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <p className="text-[18px] font-bold text-gray-900">{data.summary.total_signals}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Signals</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-[18px] font-bold text-emerald-700">{data.summary.positive_signals}</p>
                <p className="text-[9px] text-emerald-500 mt-0.5">Positive</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                <p className="text-[18px] font-bold text-red-600">{data.summary.negative_signals}</p>
                <p className="text-[9px] text-red-400 mt-0.5">Negative</p>
              </div>
            </div>
          </div>

          {/* Signal type breakdown */}
          {Object.keys(data.summary.counts_by_type).length > 0 && (
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
              {Object.entries(data.summary.counts_by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                <span key={type} className="text-[9px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                  {type.replace(/_/g, ' ')} ({count})
                </span>
              ))}
            </div>
          )}

          {/* Suggested improvements */}
          {data.suggested_improvements.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100 space-y-2">
              <p className="text-[9.5px] font-semibold text-gray-400 uppercase tracking-wider">Suggested Improvements</p>
              {data.suggested_improvements.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-[10.5px] text-gray-700 leading-snug">{s}</p>
                </div>
              ))}
            </div>
          )}

          {/* Recent signals */}
          <div className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
            {data.signals.length === 0 ? (
              <div className="px-6 py-8 text-center text-[11px] text-gray-400">
                No learning signals yet. Run workflow detection or trigger a workflow to generate signals.
              </div>
            ) : data.signals.map(s => (
              <div key={s.id} className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SIGNAL_COLOR[s.signal_type] ?? 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10.5px] font-medium text-gray-800 leading-snug">
                    {s.signal_type.replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[9px] text-gray-400">{s.signal_source}</span>
                    <span className="text-[9px] text-gray-300">·</span>
                    <span className="text-[9px] text-gray-400">strength {s.signal_strength}</span>
                    <span className="text-[9px] text-gray-300">·</span>
                    <span className="text-[9px] text-gray-400">{timeAgo(s.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100">
            <Link
              href="/api/debug/workflow-learning"
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              View raw JSON →
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  )
}

// ── PANEL: Placeholder (for modes not yet fully built) ────────────────────────

function PlaceholderPanel({ label, href, onBack }: { label: string; href: string; onBack: () => void }) {
  return (
    <PanelShell>
      <div className="px-6 py-5 border-b border-gray-100">
        <BackBar label={label} onBack={onBack} />
      </div>
      <div className="px-6 py-10 text-center">
        <p className="text-[12px] text-gray-600 font-medium mb-4">
          {label} workspace coming in a future phase.
        </p>
        <Link
          href={href}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-[11px] font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          Open full page →
        </Link>
      </div>
    </PanelShell>
  )
}

// ── Controller inner (needs Suspense for useSearchParams) ─────────────────────

function WorkspaceControllerInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const rawMode  = searchParams.get('ws')
  const mode: WorkspaceMode = isWorkspaceMode(rawMode) ? rawMode : 'dashboard_home'

  function navigate(newMode: WorkspaceMode, extra?: Record<string, string>) {
    if (newMode === 'dashboard_home') {
      router.replace('/dashboard')
      return
    }
    const p = new URLSearchParams({ ws: newMode, ...extra })
    router.replace(`/dashboard?${p.toString()}`)
  }

  const goHome = () => navigate('dashboard_home')

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-56px)] px-6 py-8">
      {mode === 'dashboard_home'  && <DashboardHomePanel navigate={navigate} />}
      {mode === 'vault_upload'    && <VaultUploadPanel   onBack={goHome} />}
      {mode === 'workflow_run'    && <WorkflowRunPanel   onBack={goHome} />}
      {mode === 'events_view'     && <EventsViewPanel    onBack={goHome} />}
      {mode === 'case_focus'            && <PlaceholderPanel        label="Case Focus"          href="/cases"          onBack={goHome} />}
      {mode === 'memory_debug'          && <MemoryDebugPanel                                                                 onBack={goHome} />}
      {mode === 'runtime_health'        && <PlaceholderPanel        label="Runtime Health"      href="/runtime-health"  onBack={goHome} />}
      {mode === 'operational_replay'    && <ReplayPanel                                                                      onBack={goHome} />}
      {mode === 'procedural_patterns'   && <ProceduralPatternsPanel                                                          onBack={goHome} />}
      {mode === 'workflow_learning'     && <WorkflowLearningPanel                                                              onBack={goHome} />}
    </div>
  )
}

// ── Export — Suspense boundary included ───────────────────────────────────────

export default function WorkspaceController() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)] text-[11px] text-gray-400">
        Loading workspace…
      </div>
    }>
      <WorkspaceControllerInner />
    </Suspense>
  )
}
