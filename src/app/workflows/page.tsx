'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkflowTemplate, WorkflowRun, WorkflowChainRun } from '@/types'

const STATUS_DOT: Record<string, string> = {
  queued:           'bg-[#737373]',
  running:          'bg-[#f59e0b] animate-pulse',
  waiting_approval: 'bg-blue-400 animate-pulse',
  completed:        'bg-[#22c55e]',
  failed:           'bg-red-500',
  cancelled:        'bg-[#525252]',
  pending:          'bg-[#737373]',
}

const STATUS_COLOR: Record<string, string> = {
  queued:           'text-[#737373]',
  running:          'text-[#f59e0b]',
  waiting_approval: 'text-blue-400',
  completed:        'text-[#22c55e]',
  failed:           'text-red-400',
  cancelled:        'text-[#525252]',
  pending:          'text-[#737373]',
}

interface ProjectOption { id: string; name: string }

export default function WorkflowsPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  const [chainRuns, setChainRuns]                 = useState<WorkflowChainRun[]>([])
  const [continuingChain, setContinuingChain]     = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    const params = new URLSearchParams({ limit: '40' })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/workflows/runs?${params}`)
    if (res.ok) setRuns(await res.json())
  }, [statusFilter])

  const loadChainRuns = useCallback(async () => {
    const res = await fetch('/api/workflow-chains/runs?limit=30')
    if (res.ok) setChainRuns(await res.json())
  }, [])

  useEffect(() => {
    async function init() {
      const [tRes, pRes] = await Promise.all([
        fetch('/api/workflows/templates'),
        fetch('/api/projects'),
      ])
      if (tRes.ok) setTemplates(await tRes.json())
      if (pRes.ok) {
        const data = await pRes.json()
        setProjects(Array.isArray(data) ? data : [])
      }
      await Promise.all([loadRuns(), loadChainRuns()])
      setLoading(false)
    }
    init()
  }, [loadRuns, loadChainRuns])

  useEffect(() => { loadRuns() }, [loadRuns])

  async function submitRun() {
    if (!selectedTemplate) return
    const template = templates.find(t => t.id === selectedTemplate)
    if (!template) return

    setRunning(true)
    setRunError('')
    try {
      const body: Record<string, unknown> = { template_id: selectedTemplate }
      if (selectedProject) body.project_id = selectedProject
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        setRunError(j.error ?? 'Run failed')
      } else {
        setSelectedTemplate('')
        await loadRuns()
      }
    } catch {
      setRunError('Network error')
    } finally {
      setRunning(false)
    }
  }

  async function cancelRun(runId: string) {
    await fetch(`/api/workflows/runs/${runId}/cancel`, { method: 'POST' })
    await loadRuns()
  }

  async function continueChainRun(runId: string) {
    setContinuingChain(runId)
    try {
      await fetch(`/api/workflow-chains/runs/${runId}/continue`, { method: 'POST' })
      await loadChainRuns()
    } finally {
      setContinuingChain(null)
    }
  }

  const categories = [...new Set(templates.map(t => t.category))].sort()
  const filteredRuns = runs

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-sm text-[#525252]">Loading workflows…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md px-6 h-14 flex items-center gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Workflows</h1>
          <p className="text-[10px] text-[#3a3a3a]">Automated operational tasks</p>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-8">
        {/* Run a workflow */}
        <section>
          <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-4">Run a Workflow</h2>

          {runError && (
            <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {runError}
            </div>
          )}

          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-4">
            {/* Template grid by category */}
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">{cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {templates.filter(t => t.category === cat).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id === selectedTemplate ? '' : t.id)}
                      className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                        selectedTemplate === t.id
                          ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                          : 'bg-[#0d0d0d] border-[#1a1a1a] text-[#a3a3a3] hover:border-[#2a2a2a]'
                      }`}
                    >
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && (
                        <p className={`text-xs mt-0.5 ${selectedTemplate === t.id ? 'text-[#f59e0b]/70' : 'text-[#525252]'}`}>
                          {t.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {selectedTemplate && (
              <div className="pt-2 border-t border-[#1a1a1a] flex items-center gap-3 flex-wrap">
                {templates.find(t => t.id === selectedTemplate)?.project_scoped && (
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="text-sm bg-[#0d0d0d] border border-[#2a2a2a] text-[#e5e5e5] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#f59e0b]/50"
                  >
                    <option value="">— Global (no project) —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={submitRun}
                  disabled={running}
                  className="text-sm px-5 py-1.5 rounded-lg bg-[#f59e0b] text-black font-medium hover:bg-[#f59e0b]/90 disabled:opacity-40 transition-colors"
                >
                  {running ? 'Running…' : 'Run Workflow'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Run history */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider">Run History</h2>
            <div className="flex items-center gap-1">
              {['all', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[10px] px-2 py-0.5 rounded capitalize transition-colors ${
                    statusFilter === s
                      ? 'bg-[#1a1a1a] text-[#e5e5e5] border border-[#2a2a2a]'
                      : 'text-[#525252] hover:text-[#a3a3a3]'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button onClick={loadRuns} className="ml-1 text-[10px] text-[#525252] hover:text-[#a3a3a3]" title="Refresh">↺</button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredRuns.map(run => (
              <div key={run.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#161616] transition-colors"
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-[#525252]'}`} />
                  <span className="text-sm text-[#e5e5e5] flex-1 truncate">
                    {(run as WorkflowRun & { template?: WorkflowTemplate }).template?.name ?? run.workflow_template_id}
                  </span>
                  <span className={`text-xs ${STATUS_COLOR[run.status] ?? 'text-[#525252]'}`}>{run.status}</span>
                  <span className="text-[10px] text-[#525252] shrink-0">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  {['queued', 'running', 'waiting_approval'].includes(run.status) && (
                    <button
                      onClick={e => { e.stopPropagation(); cancelRun(run.id) }}
                      className="text-[10px] text-red-400 hover:text-red-300 ml-2"
                    >
                      Cancel
                    </button>
                  )}
                  <span className="text-[#525252]">{expanded === run.id ? '▲' : '▼'}</span>
                </button>

                {expanded === run.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#1e1e1e]">
                    {run.error && (
                      <div className="mt-3 text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded p-2">{run.error}</div>
                    )}

                    {run.steps && run.steps.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider">Steps</p>
                        {run.steps
                          .slice()
                          .sort((a, b) => a.step_index - b.step_index)
                          .map(step => (
                            <div key={step.id} className="flex items-center gap-2 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[step.status] ?? 'bg-[#525252]'}`} />
                              <span className="text-[#a3a3a3]">{step.step_name}</span>
                              {step.error && <span className="text-red-400 text-[10px] truncate">{step.error}</span>}
                              <span className={`ml-auto shrink-0 ${STATUS_COLOR[step.status] ?? 'text-[#525252]'}`}>{step.status}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    {run.output && Object.keys(run.output).length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Output</p>
                        <pre className="text-[10px] text-[#737373] bg-[#0d0d0d] border border-[#1a1a1a] rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-48">
                          {JSON.stringify(run.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {filteredRuns.length === 0 && (
              <div className="text-center py-12 text-[#525252]">
                <p className="text-sm">No runs found.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Workflow Chain Runs ──────────────────────────────────────── */}
        <section id="chain-runs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-medium text-[#525252] uppercase tracking-wider">Workflow Chain Runs</h2>
              <p className="text-[10px] text-[#525252] mt-0.5">Triggered by inbox suggestion approvals</p>
            </div>
            <button onClick={loadChainRuns} className="text-[10px] text-[#525252] hover:text-[#a3a3a3]" title="Refresh">↺</button>
          </div>

          <div className="space-y-2">
            {chainRuns.map(run => (
              <div key={run.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-[#525252]'}`} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e5e5e5] truncate">
                    {run.workflow_chains?.name ?? run.workflow_chain_id.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-[#525252] truncate">
                    {run.source_type} · {run.source_id.slice(0, 12)}… · step {run.current_step}
                  </p>
                </div>

                <span className={`text-xs shrink-0 ${STATUS_COLOR[run.status] ?? 'text-[#525252]'}`}>
                  {run.status.replace(/_/g, ' ')}
                </span>

                <span className="text-[10px] text-[#525252] shrink-0">
                  {new Date(run.created_at).toLocaleString()}
                </span>

                {run.status === 'waiting_approval' && (
                  <button
                    onClick={() => continueChainRun(run.id)}
                    disabled={continuingChain === run.id}
                    className="shrink-0 text-xs px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
                  >
                    {continuingChain === run.id ? 'Continuing…' : 'Continue'}
                  </button>
                )}

                {run.status === 'failed' && run.error_message && (
                  <span className="text-[10px] text-red-400 truncate max-w-[12rem]" title={run.error_message}>
                    {run.error_message}
                  </span>
                )}
              </div>
            ))}

            {chainRuns.length === 0 && (
              <div className="text-center py-10 text-[#525252]">
                <p className="text-sm">No chain runs yet.</p>
                <p className="text-[10px] mt-1">Approve an inbox workflow suggestion to start a chain.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
