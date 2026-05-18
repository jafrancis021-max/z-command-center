'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Project, Task, Decision } from '@/types'

const STATUS_COLORS = {
  active: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  paused: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  archived: 'text-[#525252] bg-[#525252]/10 border-[#525252]/20',
}

const PRIORITY_COLORS = {
  high: 'text-red-400',
  medium: 'text-[#f59e0b]',
  low: 'text-[#525252]',
}

interface Props {
  project: Project
  latestTask: Task | null
  latestDecision: Decision | null
}

export default function ProjectCard({ project, latestTask, latestDecision }: Props) {
  const [generating, setGenerating] = useState<'prompt' | 'handover' | null>(null)
  const [result, setResult] = useState<{ type: string; content: string } | null>(null)

  async function handleGenerate(type: 'prompt' | 'handover') {
    setGenerating(type)
    setResult(null)
    try {
      const endpoint = type === 'prompt' ? '/api/generate-prompt' : '/api/generate-handover'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const content = type === 'prompt' ? data.prompt : data.handover
      setResult({ type, content })
    } catch (e) {
      setResult({ type, content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` })
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 flex flex-col gap-4 hover:border-[#2a2a2a] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-[#e5e5e5] text-sm truncate">{project.name}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[project.status]}`}>
              {project.status}
            </span>
          </div>
          <p className="text-xs text-[#525252] line-clamp-2 leading-relaxed">
            {project.description ?? 'No description'}
          </p>
        </div>
      </div>

      {/* Latest task */}
      {latestTask && (
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
          <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Latest task</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${PRIORITY_COLORS[latestTask.priority]}`}>
              [{latestTask.priority}]
            </span>
            <p className="text-xs text-[#a3a3a3] truncate">{latestTask.title}</p>
            <span className="ml-auto text-[10px] text-[#525252] shrink-0">{latestTask.status}</span>
          </div>
        </div>
      )}

      {/* Latest decision */}
      {latestDecision && (
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
          <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Latest decision</p>
          <p className="text-xs text-[#a3a3a3] line-clamp-2">{latestDecision.decision}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/projects/${project.id}`}
          className="flex-1 min-w-[120px] text-center text-xs bg-[#f59e0b] text-black font-semibold px-3 py-2 rounded-lg hover:bg-[#d97706] transition-colors"
        >
          Open Workspace
        </Link>
        <button
          onClick={() => handleGenerate('prompt')}
          disabled={!!generating}
          className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-2 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-50"
        >
          {generating === 'prompt' ? '⏳' : '⚡'} Prompt
        </button>
        <button
          onClick={() => handleGenerate('handover')}
          disabled={!!generating}
          className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-2 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-50"
        >
          {generating === 'handover' ? '⏳' : '📋'} Handover
        </button>
      </div>

      {/* Generated result overlay */}
      {result && (
        <div className="mt-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg p-3 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#f59e0b] uppercase tracking-wider">
              {result.type === 'prompt' ? 'Generated Prompt' : 'Generated Handover'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(result.content)}
                className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setResult(null)}
                className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="text-[10px] text-[#737373] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed font-mono">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  )
}
