'use client'

import React from 'react'

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({
  children,
  className = '',
  noPad = false,
  elevated = false,
}: {
  children: React.ReactNode
  className?: string
  noPad?: boolean
  elevated?: boolean
}) {
  return (
    <div
      className={`bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl overflow-hidden ${noPad ? '' : 'p-4'} ${elevated ? 'shadow-[0_4px_20px_rgba(0,0,0,0.4)]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// ── PanelHeader ───────────────────────────────────────────────────────────────

export function PanelHeader({
  title,
  subtitle,
  action,
  live = false,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  live?: boolean
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {live && <LiveIndicator />}
        <div>
          <p className="text-[10.5px] font-semibold text-[#c0c0c0]">{title}</p>
          {subtitle && <p className="text-[8.5px] text-[#3e3e3e] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[8.5px] font-semibold text-[#2e2e2e] uppercase tracking-[0.12em] mb-2">
      {children}
    </p>
  )
}

// ── LiveIndicator ─────────────────────────────────────────────────────────────

export function LiveIndicator({ color = 'bg-[#22c55e]' }: { color?: string }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${color}`} />
  )
}

// ── LivePulse (ping ring) ─────────────────────────────────────────────────────

export function LivePulse({
  dotClass  = 'bg-[#22c55e]',
  ringClass = 'bg-[#22c55e]',
  size      = 'md',
}: {
  dotClass?:  string
  ringClass?: string
  size?:      'sm' | 'md'
}) {
  const wh  = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  const dot = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${wh}`}>
      <span className={`absolute animate-ping inline-flex h-full w-full rounded-full opacity-20 ${ringClass}`} />
      <span className={`relative inline-flex rounded-full ${dot} ${dotClass}`} />
    </span>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────

const STATUS_PILL_CFG: Record<string, { bg: string; text: string; dot: string }> = {
  active:           { bg: 'bg-[#22c55e]/[0.08]',  text: 'text-[#22c55e]',  dot: 'bg-[#22c55e] animate-pulse' },
  running:          { bg: 'bg-[#f59e0b]/[0.08]',  text: 'text-[#f59e0b]',  dot: 'bg-[#f59e0b] animate-pulse' },
  paused:           { bg: 'bg-[#525252]/[0.12]',  text: 'text-[#666]',     dot: 'bg-[#525252]'               },
  archived:         { bg: 'bg-[#333]/[0.2]',      text: 'text-[#444]',     dot: 'bg-[#333]'                  },
  completed:        { bg: 'bg-[#22c55e]/[0.08]',  text: 'text-[#22c55e]',  dot: 'bg-[#22c55e]'               },
  failed:           { bg: 'bg-red-500/[0.08]',    text: 'text-red-400',    dot: 'bg-red-500'                 },
  pending:          { bg: 'bg-[#444]/[0.15]',     text: 'text-[#666]',     dot: 'bg-[#555]'                  },
  waiting_approval: { bg: 'bg-blue-500/[0.08]',   text: 'text-blue-400',   dot: 'bg-blue-400 animate-pulse'  },
  healthy:          { bg: 'bg-[#22c55e]/[0.08]',  text: 'text-[#22c55e]',  dot: 'bg-[#22c55e]'               },
  degraded:         { bg: 'bg-[#f59e0b]/[0.08]',  text: 'text-[#f59e0b]',  dot: 'bg-[#f59e0b] animate-pulse' },
  error:            { bg: 'bg-red-500/[0.08]',    text: 'text-red-400',    dot: 'bg-red-500 animate-pulse'   },
  STRONG:           { bg: 'bg-[#22c55e]/[0.08]',  text: 'text-[#22c55e]',  dot: 'bg-[#22c55e]'               },
  ACTIVE:           { bg: 'bg-[#f59e0b]/[0.08]',  text: 'text-[#f59e0b]',  dot: 'bg-[#f59e0b]'               },
  STALLED:          { bg: 'bg-orange-500/[0.08]', text: 'text-orange-400', dot: 'bg-orange-400'              },
  AT_RISK:          { bg: 'bg-red-500/[0.08]',    text: 'text-red-400',    dot: 'bg-red-500'                 },
}

export function StatusPill({
  status,
  label,
  size = 'sm',
}: {
  status: string
  label?: string
  size?:  'xs' | 'sm'
}) {
  const cfg      = STATUS_PILL_CFG[status] ?? STATUS_PILL_CFG.paused
  const textSize = size === 'xs' ? 'text-[7.5px]' : 'text-[8.5px]'
  return (
    <span className={`inline-flex items-center gap-1 ${textSize} font-medium px-1.5 py-0.5 rounded-md border border-transparent ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1 h-1 rounded-full shrink-0 ${cfg.dot}`} />
      {label ?? status}
    </span>
  )
}

// ── RuntimeBadge ──────────────────────────────────────────────────────────────

export function RuntimeBadge({
  label,
  value,
  accent = false,
}: {
  label:  string
  value:  string | number
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-[13px] font-bold tabular-nums leading-none ${accent ? 'text-[#f59e0b]' : 'text-[#888]'}`}>
        {value}
      </span>
      <span className="text-[7.5px] text-[#2e2e2e] uppercase tracking-wide">{label}</span>
    </div>
  )
}

// ── OperationalMetric ─────────────────────────────────────────────────────────

export function OperationalMetric({
  label,
  value,
  sub,
  color = 'text-[#888]',
}: {
  label: string
  value: string | number
  sub?:  string
  color?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[15px] font-bold tabular-nums leading-none ${color}`}>{value}</span>
      <span className="text-[8.5px] text-[#3e3e3e]">{label}</span>
      {sub && <span className="text-[7.5px] text-[#2e2e2e]">{sub}</span>}
    </div>
  )
}

// ── CompactStat ───────────────────────────────────────────────────────────────

export function CompactStat({
  label,
  value,
  color = 'text-[#666]',
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[11px] font-bold tabular-nums leading-none ${color}`}>{value}</span>
      <span className="text-[8px] text-[#2e2e2e]">{label}</span>
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-[#161616] ${className}`} />
}

// ── FeedEventIcon ─────────────────────────────────────────────────────────────

const FEED_ICONS: Record<string, string> = {
  workflow_started:    '▷',
  workflow_completed:  '✓',
  workflow_failed:     '✗',
  approval_created:    '◇',
  approval_approved:   '◈',
  approval_rejected:   '⊘',
  memory_consolidated: '◉',
  blocker_created:     '⚠',
  blocker_resolved:    '✓',
  inbox_triaged:       '◻',
  chain_started:       '⟳',
  chain_waiting:       '⏸',
  chain_completed:     '⟲',
  browser_run:         '▣',
  notification:        '◐',
}

export function feedIcon(eventType: string): string {
  const normalized = eventType.toLowerCase().replace(/[.\s-]/g, '_')
  return FEED_ICONS[normalized] ?? '·'
}

// ── CategoryIcon ──────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  workflow:  '⬡',
  approval:  '◈',
  memory:    '◉',
  blocker:   '⚠',
  inbox:     '◻',
  chain:     '⟳',
  execution: '▣',
  alert:     '◐',
  runtime:   '·',
}

export function categoryIcon(cat: string): string {
  return CATEGORY_ICONS[cat] ?? '·'
}

// ── ExecutionStep (timeline item) ─────────────────────────────────────────────

const STEP_CFG: Record<string, { icon: string; connector: string; label: string; text: string }> = {
  pending:   { icon: '○', connector: 'border-[#2a2a2a]', label: 'text-[#444]',    text: 'text-[#444]'     },
  running:   { icon: '●', connector: 'border-[#f59e0b]', label: 'text-[#f59e0b]', text: 'text-[#888]'     },
  completed: { icon: '✓', connector: 'border-[#22c55e]', label: 'text-[#22c55e]', text: 'text-[#777]'     },
  failed:    { icon: '✗', connector: 'border-red-500',   label: 'text-red-400',   text: 'text-red-400/60' },
  skipped:   { icon: '–', connector: 'border-[#1e1e1e]', label: 'text-[#333]',    text: 'text-[#333]'     },
}

export function ExecutionStep({
  step,
  isLast = false,
  duration,
}: {
  step: {
    step_order:    number
    action_type:   string
    description:   string
    status:        string
    screenshot_path?: string | null
    metadata?: Record<string, unknown>
  }
  isLast?:   boolean
  duration?: string
}) {
  const cfg = STEP_CFG[step.status] ?? STEP_CFG.pending

  return (
    <div className="flex gap-3">
      {/* Timeline column */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[9.5px] font-mono ${
          step.status === 'running'   ? 'border-[#f59e0b]/50 bg-[#f59e0b]/[0.08]' :
          step.status === 'completed' ? 'border-[#22c55e]/30 bg-[#22c55e]/[0.06]' :
          step.status === 'failed'    ? 'border-red-500/30 bg-red-500/[0.06]'      :
                                        'border-[#1e1e1e] bg-[#0d0d0d]'
        } ${cfg.label}`}>
          {step.status === 'running' ? (
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
          ) : cfg.icon}
        </div>
        {!isLast && (
          <div className={`w-px flex-1 min-h-[20px] border-l border-dashed mt-1 ${cfg.connector} opacity-30`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8.5px] font-mono text-[#3e3e3e] bg-[#141414] border border-[#1e1e1e] px-1.5 py-0.5 rounded">
            {step.action_type}
          </span>
          <span className={`text-[8.5px] font-medium ${cfg.label}`}>{step.status}</span>
          <span className="text-[7.5px] text-[#252525] ml-auto tabular-nums">
            {duration ? <span className="text-[#2e2e2e]">{duration}</span> : `#${step.step_order}`}
          </span>
        </div>
        <p className={`text-[9.5px] leading-snug ${cfg.text}`}>{step.description}</p>

        {step.metadata && Object.keys(step.metadata).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(step.metadata).map(([k, v]) => (
              <span key={k} className="text-[8.5px] text-[#3e3e3e] font-mono">
                <span className="text-[#2e2e2e]">{k}:</span>{' '}
                <span className="text-[#4a4a4a]">{String(v)}</span>
              </span>
            ))}
          </div>
        )}

        {step.screenshot_path && (
          <div className="mt-2 rounded-xl overflow-hidden border border-[#1a1a1a]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.screenshot_path} alt="Step screenshot" className="w-full block max-h-48 object-cover object-top" />
          </div>
        )}
      </div>
    </div>
  )
}
