'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Project, Task, Decision } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function hashColor(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
}

const ACCENT_PALETTE = [
  { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/20', glow: 'hover:border-violet-500/25' },
  { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/20',   glow: 'hover:border-blue-500/25' },
  { bg: 'bg-emerald-500/15',text: 'text-emerald-400', border: 'border-emerald-500/20',glow: 'hover:border-emerald-500/25' },
  { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/20',  glow: 'hover:border-amber-500/25' },
  { bg: 'bg-rose-500/15',   text: 'text-rose-400',   border: 'border-rose-500/20',   glow: 'hover:border-rose-500/25' },
  { bg: 'bg-cyan-500/15',   text: 'text-cyan-400',   border: 'border-cyan-500/20',   glow: 'hover:border-cyan-500/25' },
]

const STATUS_BADGE = {
  active:   'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  paused:   'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  archived: 'text-[#525252] bg-[#525252]/10 border-[#525252]/20',
}

const PRIORITY_DOT = {
  high:   'bg-red-500',
  medium: 'bg-[#f59e0b]',
  low:    'bg-[#525252]',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  project: Project
  latestTask: Task | null
  latestDecision: Decision | null
}

export default function ProjectCard({ project, latestTask, latestDecision }: Props) {
  const [generating, setGenerating] = useState<'prompt' | 'handover' | null>(null)
  const [result, setResult] = useState<{ type: string; content: string } | null>(null)

  const accent = ACCENT_PALETTE[hashColor(project.name) % ACCENT_PALETTE.length]
  const initials = getInitials(project.name)

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
    <div className={`bg-[#111] border border-[#1e1e1e] rounded-xl p-5 flex flex-col gap-4 transition-colors ${accent.glow}`}>

      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Initials block */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${accent.bg} ${accent.text} ${accent.border}`}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-[#e5e5e5] text-sm truncate">{project.name}</h3>
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[project.status]}`}>
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="text-xs text-[#525252] line-clamp-2 leading-relaxed">
              {project.description}
            </p>
          )}
          {project.current_status && (
            <p className="text-[10px] text-[#3a3a3a] mt-0.5 truncate">{project.current_status}</p>
          )}
        </div>
      </div>

      {/* Risk / blocker indicator */}
      {project.main_blocker && (
        <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400/80 leading-snug line-clamp-1">{project.main_blocker}</p>
        </div>
      )}

      {/* Latest task */}
      {latestTask && (
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
          <p className="text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Latest task</p>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[latestTask.priority]}`} />
            <p className="text-xs text-[#a3a3a3] truncate flex-1">{latestTask.title}</p>
            <span className="ml-auto text-[10px] text-[#3a3a3a] shrink-0 bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded">
              {latestTask.status}
            </span>
          </div>
        </div>
      )}

      {/* Latest decision */}
      {latestDecision && (
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
          <p className="text-[9px] text-[#3a3a3a] uppercase tracking-wider mb-1.5">Latest decision</p>
          <p className="text-xs text-[#737373] line-clamp-2 leading-relaxed">{latestDecision.decision}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/projects/${project.id}`}
          className="flex-1 min-w-[120px] text-center text-xs bg-[#f59e0b] text-black font-semibold px-3 py-2 rounded-lg hover:bg-[#e08c00] transition-colors"
        >
          Open Workspace
        </Link>
        <button
          onClick={() => handleGenerate('prompt')}
          disabled={!!generating}
          className="text-xs border border-[#222] text-[#525252] px-3 py-2 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-40"
        >
          {generating === 'prompt' ? '…' : '⚡'} Prompt
        </button>
        <button
          onClick={() => handleGenerate('handover')}
          disabled={!!generating}
          className="text-xs border border-[#222] text-[#525252] px-3 py-2 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-40"
        >
          {generating === 'handover' ? '…' : '↗'} Handover
        </button>
      </div>

      {/* Generated result */}
      {result && (
        <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#f59e0b] uppercase tracking-wider font-medium">
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
