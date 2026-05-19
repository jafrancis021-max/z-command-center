'use client'

import { useState, useEffect, useCallback } from 'react'
import type { BrowserExecutionRun, BrowserExecutionStep, BrowserRunMode } from '@/types'
import { ExecutionStep, StatusPill, Panel, SectionLabel } from '@/components/ui'

// ── Config ────────────────────────────────────────────────────────────────────

const DEMO_TARGETS = [
  { url: 'https://example.com',         label: 'example.com',        desc: 'W3C placeholder page'     },
  { url: 'https://books.toscrape.com',  label: 'books.toscrape.com', desc: 'Safe demo book catalog'   },
  { url: 'https://quotes.toscrape.com', label: 'quotes.toscrape.com',desc: 'Safe demo quote feed'     },
  { url: 'https://httpbin.org/html',    label: 'httpbin.org/html',   desc: 'HTTP test mirror page'    },
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

function durationBetween(a: string, b: string): string {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime())
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function stepDuration(steps: BrowserExecutionStep[], idx: number): string | undefined {
  const step = steps[idx]
  const next = steps[idx + 1]
  if (!step || !next) return undefined
  return durationBetween(step.created_at, next.created_at)
}

// ── Run list item ─────────────────────────────────────────────────────────────

function RunListItem({
  run, selected, onClick,
}: {
  run: BrowserExecutionRun
  selected: boolean
  onClick: () => void
}) {
  const isActive   = run.status === 'running' || run.status === 'waiting_approval'
  const isTerminal = run.status === 'completed' || run.status === 'failed'

  const statusBar =
    run.status === 'completed'        ? 'bg-[#22c55e]' :
    run.status === 'failed'           ? 'bg-red-500'    :
    run.status === 'running'          ? 'bg-[#f59e0b]'  :
    run.status === 'waiting_approval' ? 'bg-blue-400'   : 'bg-[#2a2a2a]'

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left rounded-xl border overflow-hidden transition-all duration-150 ${
        selected
          ? 'bg-[#0f0f0f] border-[#f59e0b]/20 shadow-[0_2px_12px_rgba(0,0,0,0.3)]'
          : 'bg-[#0a0a0a] border-[#161616] hover:border-[#1e1e1e] hover:bg-[#0d0d0d]'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${statusBar} ${isActive ? 'animate-pulse' : ''}`} />

      <div className="pl-3 pr-3 py-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9.5px] text-[#666] flex-1 truncate font-mono">
            {new URL(run.target_url).hostname}
          </span>
          <span className="text-[7.5px] text-[#252525] tabular-nums shrink-0">{relativeTime(run.created_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7.5px] bg-[#141414] border border-[#1a1a1a] text-[#333] px-1.5 py-0.5 rounded font-mono">
            {run.mode}
          </span>
          <StatusPill status={run.status} size="xs" />
          {isTerminal && run.result && typeof run.result === 'object' && 'page_title' in run.result && (
            <span className="text-[7.5px] text-[#2e2e2e] truncate flex-1">{String(run.result.page_title)}</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Execution progress bar ────────────────────────────────────────────────────

function ExecutionProgress({ steps }: { steps: BrowserExecutionStep[] }) {
  const total     = steps.length
  const completed = steps.filter(s => s.status === 'completed').length
  const failed    = steps.filter(s => s.status === 'failed').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  if (total === 0) return null

  return (
    <div className="bg-[#0a0a0a] border border-[#161616] rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8.5px] font-semibold text-[#2e2e2e] uppercase tracking-[0.1em]">Progress</span>
        <span className="text-[8.5px] text-[#f59e0b] tabular-nums font-mono">{completed}/{total} steps</span>
      </div>
      <div className="h-1 bg-[#161616] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${failed > 0 ? 'bg-red-500' : 'bg-[#f59e0b]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {failed > 0 && (
        <p className="text-[7.5px] text-red-400 mt-1">{failed} step{failed > 1 ? 's' : ''} failed</p>
      )}
    </div>
  )
}

// ── Execution summary ─────────────────────────────────────────────────────────

function ExecutionSummary({ run }: { run: BrowserExecutionRun }) {
  const steps     = run.steps ?? []
  const firstStep = steps[0]
  const lastStep  = steps[steps.length - 1]
  const duration  = firstStep && lastStep ? durationBetween(firstStep.created_at, lastStep.created_at) : null
  const screenshot = run.result && typeof run.result === 'object' && 'screenshot_url' in run.result
    ? String(run.result.screenshot_url)
    : null
  const pageTitle  = run.result && typeof run.result === 'object' && 'page_title' in run.result
    ? String(run.result.page_title)
    : null
  const isRunning  = run.status === 'running'

  const statusBarColor =
    run.status === 'completed' ? 'bg-[#22c55e]' :
    run.status === 'failed'    ? 'bg-red-500'    :
    run.status === 'running'   ? 'bg-[#f59e0b] animate-pulse' :
                                 'bg-[#333]'

  return (
    <div className="space-y-3">
      {/* Status header panel */}
      <Panel noPad className="overflow-hidden">
        <div className={`h-[2px] w-full ${statusBarColor}`} />

        <div className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <StatusPill status={run.status} />
                {isRunning && (
                  <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-ping opacity-60" />
                )}
                <span className="text-[7.5px] text-[#252525] font-mono">{run.id.slice(0, 8)}</span>
              </div>
              <p className="text-[10.5px] text-[#555] font-mono break-all">{run.target_url}</p>
              {run.task_description && (
                <p className="text-[9.5px] text-[#3a3a3a] mt-1">{run.task_description}</p>
              )}
            </div>
            <div className="shrink-0 text-right space-y-1">
              <span className="block text-[7.5px] bg-[#141414] border border-[#1a1a1a] text-[#333] px-2 py-0.5 rounded font-mono">{run.mode}</span>
              {duration && (
                <span className="block text-[8.5px] text-[#3a3a3a] tabular-nums font-mono">{duration}</span>
              )}
            </div>
          </div>

          {/* Metrics strip */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Steps',  value: steps.length,                                                                   color: 'text-[#777]'   },
              { label: 'Passed', value: steps.filter(s => s.status === 'completed').length,                              color: 'text-[#22c55e]' },
              { label: 'Failed', value: steps.filter(s => s.status === 'failed').length,
                color: steps.filter(s => s.status === 'failed').length > 0 ? 'text-red-400' : 'text-[#2e2e2e]' },
            ].map(m => (
              <div key={m.label} className="bg-[#090909] border border-[#151515] rounded-xl px-3 py-2 text-center">
                <p className={`text-[16px] font-bold tabular-nums ${m.color}`}>{m.value}</p>
                <p className="text-[7.5px] text-[#2a2a2a] mt-0.5 uppercase tracking-wide">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Progress (running only) */}
      {isRunning && steps.length > 0 && <ExecutionProgress steps={steps} />}

      {/* Screenshot */}
      {screenshot && (
        <Panel noPad>
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#131313]">
            <SectionLabel>Screenshot</SectionLabel>
            {pageTitle && <span className="text-[8.5px] text-[#444] truncate max-w-[180px]">{pageTitle}</span>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshot} alt="Page screenshot" className="w-full block" />
        </Panel>
      )}

      {/* Error */}
      {run.error_message && (
        <div className="bg-red-500/[0.04] border border-red-500/15 rounded-2xl px-4 py-3">
          <p className="text-[8.5px] font-semibold text-red-400 uppercase tracking-wide mb-1.5">Execution Error</p>
          <p className="text-[9.5px] text-red-400/60 font-mono leading-relaxed">{run.error_message}</p>
        </div>
      )}

      {/* Execution timeline */}
      {steps.length > 0 && (
        <Panel>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Execution Timeline</SectionLabel>
            <span className="text-[7.5px] text-[#252525] tabular-nums">{steps.length} steps</span>
          </div>
          <div className="pt-1">
            {steps.map((step, i) => (
              <ExecutionStep
                key={step.id}
                step={step}
                isLast={i === steps.length - 1}
                duration={stepDuration(steps, i)}
              />
            ))}
          </div>
        </Panel>
      )}

      {/* Result JSON */}
      {run.result && (
        <Panel>
          <SectionLabel>Result</SectionLabel>
          <pre className="bg-[#070707] border border-[#151515] rounded-xl px-3 py-2.5 text-[8.5px] text-[#3e3e3e] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(run.result, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  )
}

// ── Empty detail ──────────────────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div className="h-full min-h-[400px] bg-[#090909] border border-[#151515] rounded-2xl flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#101010] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[#222]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="16" height="14" rx="2" />
            <path d="M2 7h16" strokeLinecap="round" />
            <circle cx="5.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <p className="text-[11px] text-[#333]">Select a run to replay</p>
        <p className="text-[8.5px] text-[#202020] mt-0.5">or launch a new demo below</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrowserExecutionPage() {
  const [runs, setRuns]               = useState<BrowserExecutionRun[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<BrowserExecutionRun | null>(null)
  const [loading, setLoading]         = useState(true)
  const [launching, setLaunching]     = useState(false)
  const [targetUrl, setTargetUrl]     = useState(DEMO_TARGETS[0].url)
  const [mode, setMode]               = useState<BrowserRunMode>('headless')

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
      setRuns(prev => prev.map(r => r.id === id ? { ...r, status: run.status } : r))
    }
  }, [])

  useEffect(() => { void loadRuns() }, [loadRuns])

  useEffect(() => {
    if (!selectedId) return
    void loadRunDetail(selectedId)

    const interval = setInterval(async () => {
      const res = await fetch(`/api/browser-execution/runs/${selectedId}`)
      if (!res.ok) return
      const { run } = await res.json() as { run: BrowserExecutionRun }
      setSelectedRun(run)
      setRuns(prev => prev.map(r => r.id === selectedId ? { ...r, status: run.status } : r))
      if (run.status === 'completed' || run.status === 'failed') {
        clearInterval(interval)
        void loadRuns()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [selectedId, loadRunDetail, loadRuns])

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
    <div className="min-h-screen bg-[#080808]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#131313] bg-[#080808]/96 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-[#f59e0b]/[0.07] border border-[#f59e0b]/15 flex items-center justify-center text-[9px] text-[#f59e0b]">
            ▣
          </div>
          <h1 className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.1em]">Browser Execution</h1>
          <span className="text-[7.5px] font-semibold text-[#2a2a2a] bg-[#101010] border border-[#1a1a1a] px-2 py-0.5 rounded uppercase tracking-wider">
            Sandbox
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#22c55e]" />
          <span className="text-[8.5px] text-[#222]">Safe demo domains · Read-only</span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-5">

          {/* ── Left: controls + history ─────────────────────────── */}
          <div className="space-y-4">

            {/* Launch control */}
            <Panel noPad>
              <div className="px-4 pt-3.5 pb-3 border-b border-[#111]">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-5 h-5 rounded-lg bg-[#f59e0b]/[0.07] border border-[#f59e0b]/15 flex items-center justify-center text-[8.5px] text-[#f59e0b]">▣</div>
                  <p className="text-[10.5px] font-semibold text-[#777]">Run Demo</p>
                </div>
                <p className="text-[8.5px] text-[#2a2a2a]">Controlled Playwright sandbox</p>
              </div>

              <div className="p-4 space-y-4">
                {/* Target selector */}
                <div>
                  <SectionLabel>Target</SectionLabel>
                  <div className="space-y-0.5">
                    {DEMO_TARGETS.map(t => (
                      <button
                        key={t.url}
                        onClick={() => setTargetUrl(t.url)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-[9.5px] transition-all border ${
                          targetUrl === t.url
                            ? 'bg-[#0f0f0f] border-[#f59e0b]/20 text-[#f5a623]'
                            : 'bg-transparent border-transparent text-[#3e3e3e] hover:border-[#1a1a1a] hover:text-[#555]'
                        }`}
                      >
                        <span className="font-mono">{t.label}</span>
                        {targetUrl === t.url && (
                          <span className="block text-[7.5px] text-[#3a3a3a] mt-0.5">{t.desc}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode selector */}
                <div>
                  <SectionLabel>Mode</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['headless', 'visible'] as BrowserRunMode[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-3 py-2 rounded-xl text-[9.5px] font-medium transition-all border ${
                          mode === m
                            ? 'bg-[#0f0f0f] border-[#f59e0b]/20 text-[#f5a623]'
                            : 'bg-transparent border-[#181818] text-[#333] hover:border-[#222] hover:text-[#555]'
                        }`}
                      >
                        {m === 'headless' ? '⚡ Headless' : '🖥 Visible'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safety constraints */}
                <div className="bg-[#090909] border border-[#151515] rounded-xl px-3 py-2.5">
                  <p className="text-[7.5px] font-semibold text-[#252525] uppercase tracking-wide mb-1.5">Safety Constraints</p>
                  <div className="space-y-0.5">
                    {[
                      'Allowlisted domains only',
                      'No form submission without approval',
                      'Read-only operations',
                      'Screenshot + title extraction',
                    ].map(s => (
                      <p key={s} className="text-[7.5px] text-[#282828] flex items-center gap-1.5">
                        <span className="text-[#22c55e] shrink-0">✓</span> {s}
                      </p>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRunDemo}
                  disabled={launching}
                  className="w-full bg-[#f59e0b]/[0.07] hover:bg-[#f59e0b]/[0.12] border border-[#f59e0b]/15 hover:border-[#f59e0b]/25 text-[#f5a623] rounded-xl py-2.5 text-[10.5px] font-semibold transition-all disabled:opacity-30"
                >
                  {launching ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-bounce" />
                      <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-bounce [animation-delay:0.15s]" />
                      <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-bounce [animation-delay:0.3s]" />
                    </span>
                  ) : '▷ Run Demo Execution'}
                </button>
              </div>
            </Panel>

            {/* Run history */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Run History</SectionLabel>
                <button onClick={loadRuns} className="text-[8.5px] text-[#252525] hover:text-[#555] transition-colors">↺</button>
              </div>

              {loading ? (
                <div className="space-y-1 animate-pulse">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-12 bg-[#0a0a0a] border border-[#151515] rounded-xl" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="text-center py-8 bg-[#090909] border border-[#151515] rounded-2xl">
                  <p className="text-[9.5px] text-[#282828]">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {runs.map(run => (
                    <RunListItem
                      key={run.id}
                      run={run}
                      selected={selectedId === run.id}
                      onClick={() => setSelectedId(run.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: execution detail ───────────────────────────── */}
          <div>
            {selectedRun ? (
              <ExecutionSummary run={selectedRun} />
            ) : (
              <EmptyDetail />
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
