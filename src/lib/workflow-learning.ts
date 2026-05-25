import { getAdmin } from '@/lib/supabase-server'
import type { ProceduralPattern } from '@/lib/procedural-reinforcement'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LearningSignalType =
  | 'pattern_detected'
  | 'pattern_reinforced'
  | 'user_viewed_pattern'
  | 'user_ignored_suggestion'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'workflow_repeated'
  | 'assistant_suggested_procedure'
  | 'user_approved_procedure'
  | 'user_rejected_procedure'

export interface WorkflowLearningSignal {
  id:              string
  workspace_id:    string | null
  pattern_id:      string | null
  workflow_id:     string | null
  case_id:         string | null
  signal_type:     LearningSignalType
  signal_source:   string
  signal_strength: number
  notes:           string | null
  metadata:        Record<string, unknown>
  created_at:      string
}

export interface LearningSignalOpts {
  workspaceId:     string
  patternId?:      string | null
  workflowId?:     string | null
  caseId?:         string | null
  signalType:      LearningSignalType
  signalSource?:   string
  signalStrength?: number
  notes?:          string
  metadata?:       Record<string, unknown>
}

export interface LearningSummary {
  total_signals:    number
  counts_by_type:   Record<string, number>
  counts_by_source: Record<string, number>
  positive_signals: number
  negative_signals: number
  learning_score:   number
}

export interface LearningLoopSummary {
  checked_at:             string
  workspaceId:            string
  signals:                WorkflowLearningSignal[]
  summary:                LearningSummary
  top_pattern_ids:        string[]
  learning_score:         number
  suggested_improvements: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const POSITIVE_TYPES = new Set<LearningSignalType>([
  'pattern_detected', 'pattern_reinforced', 'workflow_completed',
  'workflow_repeated', 'user_approved_procedure', 'user_viewed_pattern',
  'assistant_suggested_procedure',
])

const NEGATIVE_TYPES = new Set<LearningSignalType>([
  'workflow_failed', 'user_rejected_procedure', 'user_ignored_suggestion',
])

const SIGNAL_WEIGHTS: Partial<Record<LearningSignalType, number>> = {
  user_approved_procedure:      0.25,
  workflow_completed:           0.20,
  workflow_repeated:            0.15,
  pattern_reinforced:           0.15,
  pattern_detected:             0.10,
  user_viewed_pattern:          0.05,
  assistant_suggested_procedure: 0.05,
  workflow_failed:              -0.10,
  user_rejected_procedure:      -0.10,
  user_ignored_suggestion:      -0.05,
}

// ── Core functions ─────────────────────────────────────────────────────────────

export async function recordWorkflowLearningSignal(opts: LearningSignalOpts): Promise<void> {
  await getAdmin()
    .from('workflow_learning_signals')
    .insert({
      workspace_id:    opts.workspaceId,
      pattern_id:      opts.patternId      ?? null,
      workflow_id:     opts.workflowId     ?? null,
      case_id:         opts.caseId         ?? null,
      signal_type:     opts.signalType,
      signal_source:   opts.signalSource   ?? 'system',
      signal_strength: opts.signalStrength ?? 1.0,
      notes:           opts.notes          ?? null,
      metadata:        opts.metadata       ?? {},
    })
}

export async function getWorkflowLearningSignals(
  workspaceId: string,
  limit        = 50,
): Promise<WorkflowLearningSignal[]> {
  const { data } = await getAdmin()
    .from('workflow_learning_signals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as unknown as WorkflowLearningSignal[]
}

export function summarizeWorkflowLearning(signals: WorkflowLearningSignal[]): LearningSummary {
  const counts_by_type:   Record<string, number> = {}
  const counts_by_source: Record<string, number> = {}
  let positive = 0
  let negative = 0

  for (const s of signals) {
    counts_by_type[s.signal_type]     = (counts_by_type[s.signal_type]     ?? 0) + 1
    counts_by_source[s.signal_source] = (counts_by_source[s.signal_source] ?? 0) + 1
    if (POSITIVE_TYPES.has(s.signal_type)) positive++
    if (NEGATIVE_TYPES.has(s.signal_type)) negative++
  }

  return {
    total_signals:    signals.length,
    counts_by_type,
    counts_by_source,
    positive_signals: positive,
    negative_signals: negative,
    learning_score:   calculateWorkflowLearningScore(signals),
  }
}

export function calculateWorkflowLearningScore(signals: WorkflowLearningSignal[]): number {
  if (signals.length === 0) return 0

  let pos = 0
  let neg = 0
  for (const s of signals) {
    const w = SIGNAL_WEIGHTS[s.signal_type] ?? 0
    if (w > 0) pos += w * s.signal_strength
    else if (w < 0) neg += Math.abs(w) * s.signal_strength
  }

  // Normalize: pos / (pos + neg + 1) gives a stable [0, 1] score
  return Math.min(Math.round((pos / (pos + neg + 1)) * 100) / 100, 1)
}

export function suggestWorkflowImprovement(
  signals:  WorkflowLearningSignal[],
  patterns: ProceduralPattern[],
): string[] {
  const suggestions: string[] = []

  // Patterns reinforced multiple times → automation candidate
  const reinforcedCounts: Record<string, number> = {}
  for (const s of signals) {
    if (s.signal_type === 'pattern_reinforced' && s.pattern_id) {
      reinforcedCounts[s.pattern_id] = (reinforcedCounts[s.pattern_id] ?? 0) + 1
    }
  }
  for (const [patternId, count] of Object.entries(reinforcedCounts)) {
    if (count >= 2) {
      const p = patterns.find(x => x.id === patternId)
      if (p) {
        suggestions.push(
          `Automate "${p.pattern_name}" — reinforced ${count}× (confidence ${(p.confidence_score * 100).toFixed(0)}%)`,
        )
      }
    }
  }

  // High-confidence patterns not yet approved
  const approvedIds = new Set(
    signals
      .filter(s => s.signal_type === 'user_approved_procedure' && s.pattern_id)
      .map(s => s.pattern_id!),
  )
  for (const p of patterns) {
    if (p.confidence_score >= 0.6 && !approvedIds.has(p.id)) {
      suggestions.push(
        `Review "${p.pattern_name}" for procedure approval (${(p.confidence_score * 100).toFixed(0)}% confidence)`,
      )
    }
  }

  // Failed workflows need attention
  const failedCount = signals.filter(s => s.signal_type === 'workflow_failed').length
  if (failedCount > 0) {
    suggestions.push(
      `${failedCount} workflow failure(s) recorded — investigate and document corrective steps`,
    )
  }

  return suggestions.slice(0, 5)
}

export async function getWorkflowLearningLoopSummary(
  workspaceId: string,
  patterns:    ProceduralPattern[],
): Promise<LearningLoopSummary> {
  const signals = await getWorkflowLearningSignals(workspaceId, 100)
  const summary = summarizeWorkflowLearning(signals)

  const patternCounts: Record<string, number> = {}
  for (const s of signals) {
    if (s.pattern_id) {
      patternCounts[s.pattern_id] = (patternCounts[s.pattern_id] ?? 0) + 1
    }
  }
  const top_pattern_ids = Object.entries(patternCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id)

  return {
    checked_at:             new Date().toISOString(),
    workspaceId,
    signals,
    summary,
    top_pattern_ids,
    learning_score:         summary.learning_score,
    suggested_improvements: suggestWorkflowImprovement(signals, patterns),
  }
}
