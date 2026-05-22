'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Project, Task, Decision } from '@/types'
import { StatusPill } from './ui'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function hashColor(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// ── Palettes (adjusted for light background) ──────────────────────────────────

const ACCENT_PALETTE = [
  {
    bg:          'bg-violet-50',
    text:        'text-violet-700',
    border:      'border-violet-200',
    hoverBorder: 'hover:border-violet-300',
    bar:         'bg-violet-500',
    glow:        '',
    ring:        'border-violet-200',
  },
  {
    bg:          'bg-blue-50',
    text:        'text-blue-700',
    border:      'border-blue-200',
    hoverBorder: 'hover:border-blue-300',
    bar:         'bg-blue-500',
    glow:        '',
    ring:        'border-blue-200',
  },
  {
    bg:          'bg-emerald-50',
    text:        'text-emerald-700',
    border:      'border-emerald-200',
    hoverBorder: 'hover:border-emerald-300',
    bar:         'bg-emerald-500',
    glow:        '',
    ring:        'border-emerald-200',
  },
  {
    bg:          'bg-amber-50',
    text:        'text-amber-700',
    border:      'border-amber-200',
    hoverBorder: 'hover:border-amber-300',
    bar:         'bg-amber-500',
    glow:        '',
    ring:        'border-amber-200',
  },
  {
    bg:          'bg-rose-50',
    text:        'text-rose-700',
    border:      'border-rose-200',
    hoverBorder: 'hover:border-rose-300',
    bar:         'bg-rose-500',
    glow:        '',
    ring:        'border-rose-200',
  },
  {
    bg:          'bg-cyan-50',
    text:        'text-cyan-700',
    border:      'border-cyan-200',
    hoverBorder: 'hover:border-cyan-300',
    bar:         'bg-cyan-500',
    glow:        '',
    ring:        'border-cyan-200',
  },
]

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-gray-300',
}

const RISK_CFG: Record<string, { bar: string; text: string; bg: string; track: string }> = {
  critical: { bar: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50 border-red-200',     track: 'bg-red-100'    },
  high:     { bar: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', track: 'bg-orange-100' },
  medium:   { bar: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  track: 'bg-amber-100'  },
  low:      { bar: 'bg-gray-400',   text: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',    track: 'bg-gray-100'   },
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

  const accent   = ACCENT_PALETTE[hashColor(project.name) % ACCENT_PALETTE.length]
  const initials = getInitials(project.name)
  const isActive = project.status === 'active'
  const riskCfg  = project.risk_level ? RISK_CFG[project.risk_level] : null

  async function handleGenerate(type: 'prompt' | 'handover') {
    setGenerating(type)
    setResult(null)
    try {
      const endpoint = type === 'prompt' ? '/api/generate-prompt' : '/api/generate-handover'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId: project.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult({ type, content: type === 'prompt' ? data.prompt : data.handover })
    } catch (e) {
      setResult({ type, content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` })
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className={`
      group relative bg-white border rounded-2xl flex flex-col overflow-hidden
      transition-all duration-200 shadow-sm
      ${accent.border} ${accent.hoverBorder}
      hover:shadow-md hover:-translate-y-[1px]
    `}>
      {/* Left accent bar */}
      <div className={`absolute left-0 inset-y-0 w-[2px] ${accent.bar} ${isActive ? 'opacity-70' : 'opacity-30'}`} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2.5">
        {/* Workspace identity tile */}
        <div className="relative shrink-0 mt-0.5">
          {isActive && (
            <span
              className={`absolute inset-0 rounded-xl border animate-ping ${accent.ring} opacity-40`}
              style={{ animationDuration: '3s' }}
            />
          )}
          <div className={`
            relative z-10 w-9 h-9 rounded-xl flex items-center justify-center
            font-bold text-[12px] shrink-0 border
            ${accent.bg} ${accent.text} ${accent.border}
          `}>
            {initials}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-gray-800 text-[12px] leading-tight truncate flex-1">{project.name}</h3>
            <StatusPill status={project.status} size="xs" />
          </div>

          {project.description && (
            <p className="text-[9.5px] text-gray-400 line-clamp-1 leading-relaxed">{project.description}</p>
          )}

          {/* Compact metrics row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {project.risk_level && riskCfg && (
              <span className={`text-[7.5px] font-medium px-1.5 py-0.5 rounded-md ${riskCfg.track} ${riskCfg.text} shrink-0 leading-none`}>
                ⚠ {project.risk_level}
              </span>
            )}
            {latestTask && !project.risk_level && (
              <span className="flex items-center gap-1 text-[8px] text-gray-300">
                <span className={`w-1 h-1 rounded-full ${PRIORITY_DOT[latestTask.priority] ?? 'bg-gray-300'}`} />
                {latestTask.priority}
              </span>
            )}
            {(project.updated_at ?? project.last_success) && (
              <span className="text-[7.5px] text-gray-300 ml-auto tabular-nums font-mono">
                {relativeTime(project.updated_at ?? project.last_success)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Current state / runtime ─────────────────────────────── */}
      {(project.current_phase || project.current_status) && (
        <div className="px-4 pb-2.5">
          <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2 border ${
            isActive
              ? `${accent.bg} ${accent.border}`
              : 'bg-gray-50 border-gray-200'
          }`}>
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse shrink-0 mt-1" />
            )}
            <div className="min-w-0 flex-1">
              {project.current_phase && (
                <p className={`text-[7.5px] font-semibold uppercase tracking-[0.12em] mb-0.5 ${isActive ? accent.text : 'text-gray-400'}`}>
                  {project.current_phase}
                </p>
              )}
              {project.current_status && (
                <p className="text-[10px] text-gray-600 leading-snug truncate">{project.current_status}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Blocker ─────────────────────────────────────────────── */}
      {project.main_blocker && riskCfg && (
        <div className="px-4 pb-2.5">
          <div className={`flex items-start gap-2 border rounded-xl px-3 py-2 ${riskCfg.bg}`}>
            <span className={`text-[9px] shrink-0 mt-0.5 ${riskCfg.text}`}>⚠</span>
            <p className={`text-[9.5px] leading-snug line-clamp-2 ${riskCfg.text}`}>{project.main_blocker}</p>
          </div>
        </div>
      )}

      {/* ── Task ────────────────────────────────────────────────── */}
      {latestTask && (
        <div className="mx-4 mb-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[latestTask.priority] ?? 'bg-gray-300'}`} />
          <p className="text-[9.5px] text-gray-600 truncate flex-1">{latestTask.title}</p>
          <span className="text-[7.5px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono shrink-0">
            {latestTask.status}
          </span>
        </div>
      )}

      {/* ── Decision ────────────────────────────────────────────── */}
      {latestDecision && (
        <div className="mx-4 mb-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
          <p className="text-[7.5px] font-semibold text-gray-400 uppercase tracking-[0.1em] mb-0.5">Decision</p>
          <p className="text-[9.5px] text-gray-600 line-clamp-1">{latestDecision.decision}</p>
        </div>
      )}

      {/* ── Next step ───────────────────────────────────────────── */}
      {project.next_step && (
        <div className="mx-4 mb-3">
          <p className="text-[9px] text-gray-500 leading-relaxed">
            <span className={`mr-1 ${accent.text} opacity-70`}>→</span>
            {project.next_step}
          </p>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="px-4 pb-3 pt-2 border-t border-gray-100 flex items-center gap-2">
        <Link
          href={`/projects/${project.id}`}
          className={`flex-1 text-center text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-all duration-150 border ${accent.bg} ${accent.text} ${accent.border} hover:opacity-80`}
        >
          Open Workspace →
        </Link>
        <button
          onClick={() => handleGenerate('prompt')}
          disabled={!!generating}
          className="text-[10px] border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-30"
          title="Generate prompt"
        >
          {generating === 'prompt' ? '…' : '⚡'}
        </button>
        <button
          onClick={() => handleGenerate('handover')}
          disabled={!!generating}
          className="text-[10px] border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-30"
          title="Generate handover"
        >
          {generating === 'handover' ? '…' : '↗'}
        </button>
      </div>

      {/* ── Generated result ─────────────────────────────────────── */}
      {result && (
        <div className="mx-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8.5px] font-semibold text-blue-600 uppercase tracking-[0.1em]">
              {result.type === 'prompt' ? 'Prompt' : 'Handover'}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(result.content)}
                className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setResult(null)}
                className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="text-[9px] text-gray-500 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed font-mono">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  )
}
