'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkflowTemplate, WorkflowRun } from '@/types'

interface Props {
  projectId: string
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'text-[#737373]',
  running: 'text-[#f59e0b]',
  waiting_approval: 'text-blue-400',
  completed: 'text-[#22c55e]',
  failed: 'text-red-400',
  cancelled: 'text-[#525252]',
}

const STATUS_DOT: Record<string, string> = {
  queued: 'bg-[#737373]',
  running: 'bg-[#f59e0b] animate-pulse',
  waiting_approval: 'bg-blue-400',
  completed: 'bg-[#22c55e]',
  failed: 'bg-red-500',
  cancelled: 'bg-[#525252]',
}

export default function WorkflowsTab({ projectId }: Props) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [tRes, rRes] = await Promise.all([
      fetch('/api/workflows/templates'),
      fetch(`/api/workflows/runs?project_id=${projectId}&limit=20`),
    ])
    if (tRes.ok) setTemplates(await tRes.json())
    if (rRes.ok) setRuns(await rRes.json())
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function runWorkflow(templateId: string) {
    setRunning(templateId)
    setError('')
    try {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, project_id: projectId }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Run failed')
      } else {
        await load()
      }
    } catch {
      setError('Network error')
    } finally {
      setRunning(null)
    }
  }

  async function cancelRun(runId: string) {
    await fetch(`/api/workflows/runs/${runId}/cancel`, { method: 'POST' })
    await load()
  }

  const projectTemplates = templates.filter(t => t.project_scoped)

  if (loading) return <div className="text-xs text-[#525252] py-8 text-center">Loading workflows…</div>

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Templates */}
      <div>
        <h3 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-3">Available Workflows</h3>
        <div className="grid grid-cols-1 gap-2">
          {projectTemplates.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-[#e5e5e5] font-medium truncate">{t.name}</p>
                {t.description && (
                  <p className="text-xs text-[#525252] mt-0.5 truncate">{t.description}</p>
                )}
                <span className="text-[10px] text-[#737373] bg-[#1a1a1a] border border-[#222] px-1.5 py-0.5 rounded mt-1 inline-block">
                  {t.category}
                </span>
              </div>
              <button
                onClick={() => runWorkflow(t.id)}
                disabled={running === t.id}
                className="ml-4 shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/20 disabled:opacity-40 transition-colors"
              >
                {running === t.id ? 'Running…' : 'Run'}
              </button>
            </div>
          ))}
          {projectTemplates.length === 0 && (
            <p className="text-xs text-[#525252]">No project-scoped workflows available.</p>
          )}
        </div>
      </div>

      {/* Run history */}
      <div>
        <h3 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-3">Run History</h3>
        <div className="space-y-2">
          {runs.map(run => (
            <div key={run.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#161616] transition-colors"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-[#525252]'}`} />
                <span className="text-sm text-[#e5e5e5] flex-1 truncate">
                  {(run as WorkflowRun & { template?: WorkflowTemplate }).template?.name ?? run.workflow_template_id}
                </span>
                <span className={`text-xs ${STATUS_COLORS[run.status] ?? 'text-[#525252]'}`}>{run.status}</span>
                <span className="text-[10px] text-[#525252] shrink-0">
                  {new Date(run.created_at).toLocaleTimeString()}
                </span>
                {['queued', 'running', 'waiting_approval'].includes(run.status) && (
                  <button
                    onClick={e => { e.stopPropagation(); cancelRun(run.id) }}
                    className="text-[10px] text-red-400 hover:text-red-300 ml-1"
                  >
                    Cancel
                  </button>
                )}
              </button>

              {expanded === run.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-[#1e1e1e]">
                  {run.error && (
                    <div className="mt-3 text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded p-2">
                      {run.error}
                    </div>
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
                            <span className={`ml-auto ${STATUS_COLORS[step.status] ?? 'text-[#525252]'}`}>{step.status}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {run.output && Object.keys(run.output).length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Output</p>
                      <pre className="text-[10px] text-[#737373] bg-[#0d0d0d] border border-[#1a1a1a] rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40">
                        {JSON.stringify(run.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {runs.length === 0 && (
            <p className="text-xs text-[#525252]">No runs yet. Select a workflow above to start.</p>
          )}
        </div>
      </div>
    </div>
  )
}
