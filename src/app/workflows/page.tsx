'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkflowTemplate, WorkflowRun, WorkflowChainRun } from '@/types'

const STATUS_DOT: Record<string, string> = {
  queued:           'bg-gray-400',
  running:          'bg-amber-400 animate-pulse',
  waiting_approval: 'bg-blue-400 animate-pulse',
  completed:        'bg-green-500',
  failed:           'bg-red-500',
  cancelled:        'bg-gray-300',
  pending:          'bg-gray-400',
}

const STATUS_COLOR: Record<string, string> = {
  queued:           'text-gray-400',
  running:          'text-amber-600',
  waiting_approval: 'text-blue-600',
  completed:        'text-green-600',
  failed:           'text-red-500',
  cancelled:        'text-gray-400',
  pending:          'text-gray-400',
}

interface ProjectOption { id: string; name: string }

export default function WorkflowsPage() {
  const [templates,        setTemplates]        = useState<WorkflowTemplate[]>([])
  const [runs,             setRuns]             = useState<WorkflowRun[]>([])
  const [projects,         setProjects]         = useState<ProjectOption[]>([])
  const [selectedProject,  setSelectedProject]  = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [running,          setRunning]          = useState(false)
  const [runError,         setRunError]         = useState('')
  const [expanded,         setExpanded]         = useState<string | null>(null)
  const [statusFilter,     setStatusFilter]     = useState<string>('all')
  const [loading,          setLoading]          = useState(true)

  const [chainRuns,       setChainRuns]       = useState<WorkflowChainRun[]>([])
  const [continuingChain, setContinuingChain] = useState<string | null>(null)

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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
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

  const categories    = [...new Set(templates.map(t => t.category))].sort()
  const filteredRuns  = runs

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <span className="text-[11px] text-gray-400">Loading workflows…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-3">
        <div>
          <h1 className="text-[13px] font-semibold text-gray-800">Workflows</h1>
          <p className="text-[9px] text-gray-400">Automated operational tasks</p>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-8">

        {/* ── Run a workflow ── */}
        <section>
          <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-4">
            Run a Workflow
          </h2>

          {runError && (
            <div className="mb-3 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              {runError}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-[0.1em] mb-2.5">{cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {templates.filter(t => t.category === cat).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id === selectedTemplate ? '' : t.id)}
                      className={`text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedTemplate === t.id
                          ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-[11.5px] font-semibold">{t.name}</p>
                      {t.description && (
                        <p className={`text-[9.5px] mt-0.5 leading-relaxed ${
                          selectedTemplate === t.id ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {t.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {selectedTemplate && (
              <div className="pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                {templates.find(t => t.id === selectedTemplate)?.project_scoped && (
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="text-[11px] bg-white border border-gray-300 text-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
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
                  className="text-[11px] px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm"
                >
                  {running ? 'Running…' : 'Run Workflow'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Run history ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
              Run History
            </h2>
            <div className="flex items-center gap-1">
              {['all', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[9.5px] px-2.5 py-1 rounded-lg capitalize transition-colors ${
                    statusFilter === s
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={loadRuns}
                className="ml-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1"
                title="Refresh"
              >
                ↺
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredRuns.map(run => (
              <div key={run.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-gray-400'}`} />
                  <span className="text-[11.5px] text-gray-800 font-medium flex-1 truncate">
                    {(run as WorkflowRun & { template?: WorkflowTemplate }).template?.name ?? run.workflow_template_id}
                  </span>
                  <span className={`text-[10px] font-medium ${STATUS_COLOR[run.status] ?? 'text-gray-400'}`}>
                    {run.status}
                  </span>
                  <span className="text-[9px] text-gray-400 shrink-0 tabular-nums">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  {['queued', 'running', 'waiting_approval'].includes(run.status) && (
                    <button
                      onClick={e => { e.stopPropagation(); cancelRun(run.id) }}
                      className="text-[9.5px] text-red-500 hover:text-red-600 ml-1 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                  <span className="text-gray-400 text-[10px]">{expanded === run.id ? '▲' : '▼'}</span>
                </button>

                {expanded === run.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 bg-gray-50/50">
                    {run.error && (
                      <div className="mt-3 text-[10.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                        {run.error}
                      </div>
                    )}

                    {run.steps && run.steps.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-[0.1em]">Steps</p>
                        {run.steps
                          .slice()
                          .sort((a, b) => a.step_index - b.step_index)
                          .map(step => (
                            <div key={step.id} className="flex items-center gap-2 text-[10.5px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[step.status] ?? 'bg-gray-400'}`} />
                              <span className="text-gray-600">{step.step_name}</span>
                              {step.error && (
                                <span className="text-red-500 text-[9.5px] truncate">{step.error}</span>
                              )}
                              <span className={`ml-auto shrink-0 text-[9.5px] ${STATUS_COLOR[step.status] ?? 'text-gray-400'}`}>
                                {step.status}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    {run.output && Object.keys(run.output).length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-[0.1em] mb-1.5">Output</p>
                        <pre className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48">
                          {JSON.stringify(run.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {filteredRuns.length === 0 && (
              <div className="text-center py-12 bg-white border border-gray-200 rounded-xl shadow-sm">
                <p className="text-[11px] text-gray-400">No runs found.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Workflow Chain Runs ── */}
        <section id="chain-runs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                Workflow Chain Runs
              </h2>
              <p className="text-[9px] text-gray-400 mt-0.5">
                Triggered by inbox suggestion approvals
              </p>
            </div>
            <button
              onClick={loadChainRuns}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              ↺
            </button>
          </div>

          <div className="space-y-2">
            {chainRuns.map(run => (
              <div
                key={run.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center gap-3 flex-wrap shadow-sm"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-gray-400'}`} />

                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-medium text-gray-800 truncate">
                    {run.workflow_chains?.name ?? run.workflow_chain_id.slice(0, 8)}
                  </p>
                  <p className="text-[9px] text-gray-400 truncate mt-0.5">
                    {run.source_type} · {run.source_id.slice(0, 12)}… · step {run.current_step}
                  </p>
                </div>

                <span className={`text-[10px] font-medium shrink-0 ${STATUS_COLOR[run.status] ?? 'text-gray-400'}`}>
                  {run.status.replace(/_/g, ' ')}
                </span>

                <span className="text-[9px] text-gray-400 shrink-0 tabular-nums">
                  {new Date(run.created_at).toLocaleString()}
                </span>

                {run.status === 'waiting_approval' && (
                  <button
                    onClick={() => continueChainRun(run.id)}
                    disabled={continuingChain === run.id}
                    className="shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                  >
                    {continuingChain === run.id ? 'Continuing…' : 'Continue'}
                  </button>
                )}

                {run.status === 'failed' && run.error_message && (
                  <span className="text-[9.5px] text-red-500 truncate max-w-[12rem]" title={run.error_message}>
                    {run.error_message}
                  </span>
                )}
              </div>
            ))}

            {chainRuns.length === 0 && (
              <div className="text-center py-10 bg-white border border-gray-200 rounded-xl shadow-sm">
                <p className="text-[11px] text-gray-400">No chain runs yet.</p>
                <p className="text-[9px] text-gray-300 mt-1">
                  Approve an inbox workflow suggestion to start a chain.
                </p>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  )
}
