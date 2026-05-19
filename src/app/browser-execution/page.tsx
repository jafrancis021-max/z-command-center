'use client'

import { useState, useEffect, useCallback } from 'react'
import type { BrowserExecutionRun, BrowserExecutionStep, BrowserRunMode } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const DEMO_TARGETS = [
  { url: 'https://example.com',         label: 'example.com' },
  { url: 'https://books.toscrape.com',  label: 'books.toscrape.com' },
  { url: 'https://quotes.toscrape.com', label: 'quotes.toscrape.com' },
  { url: 'https://httpbin.org/html',    label: 'httpbin.org/html' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

const STATUS_CFG: Record<string, { dot: string; text: string; label: string }> = {
  pending:          { dot: 'bg-[#555]',            text: 'text-[#888]',    label: 'Pending' },
  running:          { dot: 'bg-[#f59e0b] animate-pulse', text: 'text-[#f59e0b]', label: 'Running' },
  waiting_approval: { dot: 'bg-blue-400 animate-pulse',  text: 'text-blue-400',  label: 'Awaiting Approval' },
  completed:        { dot: 'bg-[#22c55e]',          text: 'text-[#22c55e]', label: 'Completed' },
  failed:           { dot: 'bg-red-500',             text: 'text-red-400',   label: 'Failed' },
}

const STEP_STATUS_CFG: Record<string, { icon: string; color: string }> = {
  pending:   { icon: '○', color: 'text-[#444]' },
  running:   { icon: '●', color: 'text-[#f59e0b] animate-pulse' },
  completed: { icon: '✓', color: 'text-[#22c55e]' },
  failed:    { icon: '✗', color: 'text-red-400' },
  skipped:   { icon: '–', color: 'text-[#444]' },
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: BrowserExecutionStep }) {
  const cfg  = STEP_STATUS_CFG[step.status] ?? STEP_STATUS_CFG.pending

  return (
    <div className="flex items-start gap-3 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3">
      <span className={`text-sm font-mono mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-mono text-[#444] bg-[#161616] border border-[#1e1e1e] px-1.5 py-0.5 rounded">
            {step.action_type}
          </span>
          <span className={`text-[10px] ${cfg.color}`}>{step.status}</span>
        </div>
        <p className="text-[11px] text-[#888]">{step.description}</p>
        {step.metadata && Object.keys(step.metadata).length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {Object.entries(step.metadata).map(([k, v]) => (
              <p key={k} className="text-[10px] text-[#444] font-mono">
                <span className="text-[#333]">{k}:</span>{' '}
                <span className="text-[#666]">{String(v)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[9px] text-[#2e2e2e] tabular-nums">
        #{step.step_order}
      </span>
    </div>
  )
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({
  run,
  selected,
  onSelect,
}: {
  run: BrowserExecutionRun
  selected: boolean
  onSelect: () => void
}) {
  const cfg = STATUS_CFG[run.status] ?? STATUS_CFG.pending

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-[#0f0f0f] border rounded-xl px-4 py-3 transition-colors ${
        selected ? 'border-[#f59e0b]/30' : 'border-[#1a1a1a] hover:border-[#242424]'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
        <span className="text-[9px] text-[#2e2e2e] ml-auto tabular-nums">{relativeTime(run.created_at)}</span>
      </div>
      <p className="text-[11px] text-[#777] truncate">{run.target_url}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[9px] text-[#333] bg-[#161616] border border-[#1e1e1e] px-1.5 py-0.5 rounded">
          {run.mode}
        </span>
        {run.result && typeof run.result === 'object' && 'page_title' in run.result && (
          <span className="text-[9px] text-[#444] truncate">
            {String(run.result.page_title)}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

function RunDetail({ run }: { run: BrowserExecutionRun }) {
  const cfg        = STATUS_CFG[run.status] ?? STATUS_CFG.pending
  const screenshotUrl = run.result && typeof run.result === 'object' && 'screenshot_url' in run.result
    ? String(run.result.screenshot_url)
    : null

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
          <span className="text-[9px] text-[#333] ml-auto tabular-nums">{relativeTime(run.created_at)}</span>
        </div>
        <p className="text-[11px] text-[#666] font-mono break-all">{run.target_url}</p>
        {run.task_description && (
          <p className="text-[10px] text-[#444] mt-1">{run.task_description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] bg-[#161616] border border-[#1e1e1e] text-[#444] px-1.5 py-0.5 rounded">
            {run.mode}
          </span>
          <span className="text-[9px] text-[#2e2e2e] font-mono">{run.id.slice(0, 8)}…</span>
        </div>
      </div>

      {/* Screenshot */}
      {screenshotUrl && (
        <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl overflow-hidden">
          <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em] px-4 py-2 border-b border-[#161616]">
            Screenshot
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Browser screenshot"
            className="w-full block"
          />
        </div>
      )}

      {/* Error */}
      {run.error_message && (
        <div className="bg-red-500/[0.04] border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-red-400 mb-1">Error</p>
          <p className="text-[10px] text-red-400/70 font-mono">{run.error_message}</p>
        </div>
      )}

      {/* Steps timeline */}
      {(run.steps ?? []).length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em] mb-2">
            Step Timeline
          </p>
          <div className="space-y-1.5">
            {(run.steps ?? []).map(step => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </div>
      )}

      {/* Result JSON */}
      {run.result && (
        <div>
          <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em] mb-2">
            Result JSON
          </p>
          <pre className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3 text-[10px] text-[#555] font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(run.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrowserExecutionPage() {
  const [runs, setRuns]           = useState<BrowserExecutionRun[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<BrowserExecutionRun | null>(null)
  const [loading, setLoading]     = useState(true)
  const [launching, setLaunching] = useState(false)
  const [targetUrl, setTargetUrl] = useState(DEMO_TARGETS[0].url)
  const [mode, setMode]           = useState<BrowserRunMode>('headless')
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/browser-execution/runs')
    if (res.ok) {
      const { runs: data } = await res.json() as { runs: BrowserExecutionRun[] }
      setRuns(data ?? [])
    }
    setLoading(false)
  }, [])

  const loadRunDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/browser-execution/runs/${id}`)
    if (res.ok) {
      const { run } = await res.json() as { run: BrowserExecutionRun }
      setSelectedRun(run)
    }
  }, [])

  useEffect(() => { void loadRuns() }, [loadRuns])

  useEffect(() => {
    if (!selectedId) return
    void loadRunDetail(selectedId)
  }, [selectedId, loadRunDetail])

  // Poll active run every 2s
  useEffect(() => {
    if (pollInterval) clearInterval(pollInterval)
    if (!selectedId) return

    const interval = setInterval(async () => {
      await loadRunDetail(selectedId)
      await loadRuns()
      const current = runs.find(r => r.id === selectedId)
      if (current?.status === 'completed' || current?.status === 'failed') {
        clearInterval(interval)
      }
    }, 2000)

    setPollInterval(interval)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleRunDemo() {
    setLaunching(true)
    try {
      const res = await fetch('/api/browser-execution/run-demo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ target_url: targetUrl, mode }),
      })
      if (res.ok) {
        const { run_id } = await res.json() as { run_id: string }
        await loadRuns()
        setSelectedId(run_id)
      }
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#161616] bg-[#0a0a0a]/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[11px] font-semibold text-[#888]">Browser Execution</h1>
          <span className="text-[9px] font-semibold text-[#444] bg-[#141414] border border-[#1e1e1e] px-2 py-0.5 rounded uppercase tracking-wide">
            Sandbox
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-[#2e2e2e]">
            Safe demo domains only · No real portal access
          </span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">

          {/* ── Left: controls + run list ───────────────────────────────── */}
          <div className="space-y-4">

            {/* Launch panel */}
            <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg bg-[#f59e0b]/[0.08] border border-[#f59e0b]/15 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#f59e0b]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="2" y="3" width="16" height="14" rx="2" />
                    <path d="M2 7h16" strokeLinecap="round" />
                    <circle cx="5.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
                    <circle cx="8.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <p className="text-[11px] font-semibold text-[#c0c0c0]">Run Demo Execution</p>
              </div>

              {/* Target URL */}
              <div>
                <label className="text-[9px] font-semibold text-[#333] uppercase tracking-[0.1em] block mb-1.5">
                  Target URL
                </label>
                <div className="space-y-1">
                  {DEMO_TARGETS.map(t => (
                    <button
                      key={t.url}
                      onClick={() => setTargetUrl(t.url)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-[10px] transition-colors border ${
                        targetUrl === t.url
                          ? 'bg-[#f59e0b]/[0.06] border-[#f59e0b]/20 text-[#f5a623]'
                          : 'bg-[#0d0d0d] border-[#191919] text-[#555] hover:border-[#222] hover:text-[#777]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode selector */}
              <div>
                <label className="text-[9px] font-semibold text-[#333] uppercase tracking-[0.1em] block mb-1.5">
                  Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['headless', 'visible'] as BrowserRunMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-medium transition-colors border ${
                        mode === m
                          ? 'bg-[#f59e0b]/[0.06] border-[#f59e0b]/20 text-[#f5a623]'
                          : 'bg-[#0d0d0d] border-[#191919] text-[#555] hover:border-[#222]'
                      }`}
                    >
                      {m === 'headless' ? '⚡ Headless' : '🖥 Visible'}
                    </button>
                  ))}
                </div>
                {mode === 'visible' && (
                  <p className="text-[9px] text-[#444] mt-1.5">
                    Visible mode opens a real browser window on the server desktop.
                  </p>
                )}
              </div>

              {/* Safety notice */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-semibold text-[#333] uppercase tracking-wide mb-1">Safety limits</p>
                <ul className="text-[9px] text-[#333] space-y-0.5">
                  <li>✓ Demo domains only (no real portals)</li>
                  <li>✓ No form submission without approval</li>
                  <li>✓ Read-only scrape operations</li>
                  <li>✓ Screenshot + title extraction only</li>
                </ul>
              </div>

              <button
                onClick={handleRunDemo}
                disabled={launching}
                className="w-full bg-[#f59e0b]/[0.08] hover:bg-[#f59e0b]/[0.12] border border-[#f59e0b]/20 text-[#f5a623] rounded-xl py-2.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
              >
                {launching ? 'Launching…' : '▶ Run Demo Execution'}
              </button>
            </div>

            {/* Run history */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em]">Run History</p>
                <button onClick={loadRuns} className="text-[9px] text-[#2e2e2e] hover:text-[#555] transition-colors">↺ refresh</button>
              </div>
              {loading ? (
                <div className="space-y-1.5 animate-pulse">
                  {[80, 90, 70].map((w, i) => (
                    <div key={i} className="h-16 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl" style={{ opacity: w / 100 }} />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="text-center py-10 bg-[#0c0c0c] border border-[#1a1a1a] rounded-xl">
                  <p className="text-[11px] text-[#333]">No runs yet.</p>
                  <p className="text-[10px] text-[#2a2a2a] mt-0.5">Launch the demo above to start.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {runs.map(run => (
                    <RunCard
                      key={run.id}
                      run={run}
                      selected={selectedId === run.id}
                      onSelect={() => setSelectedId(run.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: run detail ──────────────────────────────────────── */}
          <div>
            {!selectedRun ? (
              <div className="h-full min-h-[320px] bg-[#0c0c0c] border border-[#1a1a1a] rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-[#141414] border border-[#1e1e1e] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5 text-[#333]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="3" width="16" height="14" rx="2" />
                      <path d="M2 7h16" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-[#444]">Select a run to view details</p>
                  <p className="text-[10px] text-[#2e2e2e] mt-0.5">or launch a new demo above</p>
                </div>
              </div>
            ) : (
              <RunDetail run={selectedRun} />
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
