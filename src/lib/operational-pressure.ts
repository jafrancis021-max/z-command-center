// Deterministic operational pressure scoring.
// All factors are observable, traceable counts — no AI inference.

export type PressureLevel = 'low' | 'moderate' | 'elevated' | 'high'

export interface PressureFactor {
  name:         string
  contribution: number
  detail:       string
}

export interface PressureScore {
  level:          PressureLevel
  score:          number  // 0–100
  factors:        PressureFactor[]
  primary_driver: string | null
}

export interface PressureInput {
  staleApprovals:        number  // pending >24h
  pendingApprovals:      number
  criticalBlockers:      number
  openBlockers:          number
  failedWorkflows24h:    number
  stuckJobs:             number
  failedExecutions24h:   number
  criticalNotifications: number
  inboxBacklog:          number  // pending suggestions
}

export function calculatePressure(input: PressureInput): PressureScore {
  const factors: PressureFactor[] = []
  let raw = 0

  function add(name: string, contribution: number, detail: string) {
    if (contribution <= 0) return
    raw += contribution
    factors.push({ name, contribution, detail })
  }

  add(
    'Stale approvals',
    Math.min(28, input.staleApprovals * 9),
    `${input.staleApprovals} approval${input.staleApprovals > 1 ? 's' : ''} pending >24h`,
  )
  add(
    'Critical blockers',
    Math.min(30, input.criticalBlockers * 15),
    `${input.criticalBlockers} critical blocker${input.criticalBlockers > 1 ? 's' : ''} unresolved`,
  )
  add(
    'Workflow failures',
    Math.min(20, input.failedWorkflows24h * 4),
    `${input.failedWorkflows24h} workflow failure${input.failedWorkflows24h > 1 ? 's' : ''} in 24h`,
  )
  add(
    'Stuck jobs',
    Math.min(20, input.stuckJobs * 10),
    `${input.stuckJobs} job${input.stuckJobs > 1 ? 's' : ''} overdue >2× interval`,
  )
  add(
    'Execution failures',
    Math.min(15, input.failedExecutions24h * 5),
    `${input.failedExecutions24h} browser execution failure${input.failedExecutions24h > 1 ? 's' : ''}`,
  )
  add(
    'Critical alerts',
    Math.min(10, input.criticalNotifications * 5),
    `${input.criticalNotifications} unread critical notification${input.criticalNotifications > 1 ? 's' : ''}`,
  )
  add(
    'Inbox backlog',
    Math.min(8, Math.floor(input.inboxBacklog / 5)),
    `${input.inboxBacklog} inbox suggestions unprocessed`,
  )

  const score = Math.min(100, raw)
  const level: PressureLevel =
    score >= 70 ? 'high'     :
    score >= 45 ? 'elevated' :
    score >= 18 ? 'moderate' : 'low'

  factors.sort((a, b) => b.contribution - a.contribution)
  const primary_driver = factors[0]?.name ?? null

  return { level, score, factors, primary_driver }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const PRESSURE_CFG: Record<PressureLevel, {
  label:  string
  color:  string
  bg:     string
  border: string
  dot:    string
}> = {
  low:      { label: 'Low',      color: 'text-[#22c55e]',  bg: 'bg-[#22c55e]/10',  border: 'border-[#22c55e]/20', dot: 'bg-[#22c55e]'  },
  moderate: { label: 'Moderate', color: 'text-[#a3a3a3]',  bg: 'bg-[#1a1a1a]',     border: 'border-[#2a2a2a]',   dot: 'bg-[#666]'     },
  elevated: { label: 'Elevated', color: 'text-[#f59e0b]',  bg: 'bg-[#f59e0b]/10',  border: 'border-[#f59e0b]/20',dot: 'bg-[#f59e0b]'  },
  high:     { label: 'High',     color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/20',  dot: 'bg-red-500'    },
}
