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

// ── Palettes ──────────────────────────────────────────────────────────────────

const ACCENT_PALETTE = [
  {
    bg:          'bg-violet-500/[0.08]',
    text:        'text-violet-300',
    border:      'border-violet-500/20',
    hoverBorder: 'hover:border-violet-500/35',
    bar:         'bg-violet-500',
    glow:        'shadow-[0_0_24px_rgba(139,92,246,0.09)]',
    ring:        'border-violet-500/20',
  },
  {
    bg:          'bg-blue-500/[0.08]',
    text:        'text-blue-300',
    border:      'border-blue-500/20',
    hoverBorder: 'hover:border-blue-500/35',
    bar:         'bg-blue-500',
    glow:        'shadow-[0_0_24px_rgba(59,130,246,0.09)]',
    ring:        'border-blue-500/20',
  },
  {
    bg:          'bg-emerald-500/[0.08]',
    text:        'text-emerald-300',
    border:      'border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/35',
    bar:         'bg-emerald-500',
    glow:        'shadow-[0_0_24px_rgba(16,185,129,0.09)]',
    ring:        'border-emerald-500/20',
  },
  {
    bg:          'bg-amber-500/[0.08]',
    text:        'text-amber-300',
    border:      'border-amber-500/20',
    hoverBorder: 'hover:border-amber-500/35',
    bar:         'bg-amber-500',
    glow:        'shadow-[0_0_24px_rgba(245,158,11,0.09)]',
    ring:        'border-amber-500/20',
  },
  {
    bg:          'bg-rose-500/[0.08]',
    text:        'text-rose-300',
    border:      'border-rose-500/20',
    hoverBorder: 'hover:border-rose-500/35',
    bar:         'bg-rose-500',
    glow:        'shadow-[0_0_24px_rgba(244,63,94,0.09)]',
    ring:        'border-rose-500/20',
  },
  {
    bg:          'bg-cyan-500/[0.08]',
    text:        'text-cyan-300',
    border:      'border-cyan-500/20',
    hoverBorder: 'hover:border-cyan-500/35',
    bar:         'bg-cyan-500',
    glow:        'shadow-[0_0_24px_rgba(6,182,212,0.09)]',
    ring:        'border-cyan-500/20',
  },
]

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-[#f59e0b]',
  low:    'bg-[#3a3a3a]',
}

const RISK_CFG: Record<string, { bar: string; text: string; bg: string; track: string }> = {
  critical: { bar: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/[0.05] border-red-500/15',       track: 'bg-red-500/[0.12]' },
  high:     { bar: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/[0.05] border-orange-500/15', track: 'bg-orange-500/[0.12]' },
  medium:   { bar: 'bg-[#f59e0b]',  text: 'text-[#f59e0b]',  bg: 'bg-[#f59e0b]/[0.05] border-[#f59e0b]/15',  track: 'bg-[#f59e0b]/[0.12]' },
  low:      { bar: 'bg-[#444]',     text: 'text-[#666]',     bg: 'bg-[#141414] border-[#1e1e1e]',             track: 'bg-[#1e1e1e]' },
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
      group relative bg-[#0d0d0d] border rounded-2xl flex flex-col overflow-hidden
      transition-all duration-200
      ${accent.border} ${accent.hoverBorder}
      hover:shadow-[0_8px_36px_rgba(0,0,0,0.6),0_2px_10px_rgba(0,0,0,0.4)]
      hover:-translate-y-[1px]
      ${isActive ? accent.glow : ''}
    `}>
      {/* Accent top bar */}
      <div className={`h-[2px] w-full ${accent.bar} ${isActive ? 'opacity-65' : 'opacity-25'}`} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        {/* Workspace identity tile */}
        <div className="relative shrink-0 mt-0.5">
          {isActive && (
            <span
              className={`absolute inset-0 rounded-xl border animate-ping ${accent.ring} opacity-35`}
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
            <h3 className="font-semibold text-[#ccc] text-[12px] leading-tight truncate flex-1">{project.name}</h3>
            <StatusPill status={project.status} size="xs" />
          </div>

          {project.description && (
            <p className="text-[9.5px] text-[#3e3e3e] line-clamp-1 leading-relaxed">{project.description}</p>
          )}

          {/* Compact metrics row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {project.risk_level && riskCfg && (
              <span className={`text-[7.5px] font-medium px-1.5 py-0.5 rounded-md ${riskCfg.track} ${riskCfg.text} shrink-0 leading-none`}>
                ⚠ {project.risk_level}
              </span>
            )}
            {latestTask && !project.risk_level && (
              <span className="flex items-center gap-1 text-[8px] text-[#3a3a3a]">
                <span className={`w-1 h-1 rounded-full ${PRIORITY_DOT[latestTask.priority] ?? 'bg-[#444]'}`} />
                {latestTask.priority}
              </span>
            )}
            {(project.updated_at ?? project.last_success) && (
              <span className="text-[7.5px] text-[#252525] ml-auto tabular-nums font-mono">
                {relativeTime(project.updated_at ?? project.last_success)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Current state / runtime ─────────────────────────────── */}
      {(project.current_phase || project.current_status) && (
        <div className="px-4 pb-3">
          <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2 border ${
            isActive
              ? `${accent.bg} ${accent.border}`
              : 'bg-[#090909] border-[#161616]'
          }`}>
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse shrink-0 mt-1" />
            )}
            <div className="min-w-0 flex-1">
              {project.current_phase && (
                <p className={`text-[7.5px] font-semibold uppercase tracking-[0.12em] mb-0.5 ${isActive ? accent.text : 'text-[#2e2e2e]'}`}>
                  {project.current_phase}
                </p>
              )}
              {project.current_status && (
                <p className="text-[10px] text-[#5a5a5a] leading-snug truncate">{project.current_status}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Blocker ─────────────────────────────────────────────── */}
      {project.main_blocker && riskCfg && (
        <div className="px-4 pb-3">
          <div className={`flex items-start gap-2 border rounded-xl px-3 py-2 ${riskCfg.bg}`}>
            <span className={`text-[9px] shrink-0 mt-0.5 ${riskCfg.text}`}>⚠</span>
            <p className={`text-[9.5px] leading-snug line-clamp-2 ${riskCfg.text}`}>{project.main_blocker}</p>
          </div>
        </div>
      )}

      {/* ── Task ────────────────────────────────────────────────── */}
      {latestTask && (
        <div className="mx-4 mb-2 bg-[#090909] border border-[#161616] rounded-xl px-3 py-2 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[latestTask.priority] ?? 'bg-[#444]'}`} />
          <p className="text-[9.5px] text-[#686868] truncate flex-1">{latestTask.title}</p>
          <span className="text-[7.5px] text-[#2a2a2a] bg-[#131313] border border-[#1d1d1d] px-1.5 py-0.5 rounded font-mono shrink-0">
            {latestTask.status}
          </span>
        </div>
      )}

      {/* ── Decision ────────────────────────────────────────────── */}
      {latestDecision && (
        <div className="mx-4 mb-2.5 bg-[#090909] border border-[#161616] rounded-xl px-3 py-2">
          <p className="text-[7.5px] font-semibold text-[#282828] uppercase tracking-[0.1em] mb-0.5">Decision</p>
          <p className="text-[9.5px] text-[#4a4a4a] line-clamp-1">{latestDecision.decision}</p>
        </div>
      )}

      {/* ── Next step ───────────────────────────────────────────── */}
      {project.next_step && (
        <div className="mx-4 mb-3">
          <p className="text-[9px] text-[#2a2a2a] leading-relaxed">
            <span className={`mr-1 ${accent.text} opacity-50`}>→</span>
            {project.next_step}
          </p>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2 border-t border-[#101010] flex items-center gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="flex-1 text-center text-[10.5px] font-semibold bg-[#f59e0b]/[0.06] hover:bg-[#f59e0b]/[0.12] border border-[#f59e0b]/15 hover:border-[#f59e0b]/28 text-[#f5a623] px-3 py-1.5 rounded-xl transition-all duration-150"
        >
          Open Workspace →
        </Link>
        <button
          onClick={() => handleGenerate('prompt')}
          disabled={!!generating}
          className="text-[10px] border border-[#1c1c1c] bg-[#0a0a0a] text-[#3a3a3a] hover:text-[#666] hover:border-[#2a2a2a] hover:bg-[#0e0e0e] px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-30"
          title="Generate prompt"
        >
          {generating === 'prompt' ? '…' : '⚡'}
        </button>
        <button
          onClick={() => handleGenerate('handover')}
          disabled={!!generating}
          className="text-[10px] border border-[#1c1c1c] bg-[#0a0a0a] text-[#3a3a3a] hover:text-[#666] hover:border-[#2a2a2a] hover:bg-[#0e0e0e] px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-30"
          title="Generate handover"
        >
          {generating === 'handover' ? '…' : '↗'}
        </button>
      </div>

      {/* ── Generated result ─────────────────────────────────────── */}
      {result && (
        <div className="mx-4 mb-4 bg-[#090909] border border-[#1e1e1e] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8.5px] font-semibold text-[#f59e0b] uppercase tracking-[0.1em]">
              {result.type === 'prompt' ? 'Prompt' : 'Handover'}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(result.content)}
                className="text-[9px] text-[#3a3a3a] hover:text-[#777] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setResult(null)}
                className="text-[9px] text-[#3a3a3a] hover:text-[#777] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="text-[9px] text-[#555] whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed font-mono">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  )
}
