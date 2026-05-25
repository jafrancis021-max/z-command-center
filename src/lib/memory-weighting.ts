import type { MemoryMode } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemScope = 'workspace' | 'global'

// Full shape of a DB row after we select the extended column set
export interface RawMemoryRow {
  id:                       string
  title:                    string
  content:                  string
  memory_layer:             string
  memory_mode:              string
  category:                 string
  temperature_tier:         string
  trust_score:              number
  retrieval_priority:       number
  workspace_id:             string | null
  recency_score:            number
  workflow_relevance_score: number
  linked_case_id:           string | null
  linked_workflow_id:       string | null
  // Phase 6 — freshness fields
  authority_level:          string
  last_retrieved_at:        string | null
  retrieval_count:          number
}

export interface ScoreBreakdown {
  workspace_match:    number
  case_link:          number
  workflow_link:      number
  mode_match:         number
  temperature:        number
  priority:           number
  trust:              number
  recency:            number
  workflow_relevance: number
  retrieval_bonus:    number
  penalties:          number
  total:              number
}

export interface ScoredMemoryItem extends RawMemoryRow {
  scope:                ItemScope
  workspace_score:      number
  score_breakdown:      ScoreBreakdown
  included_reason:      string
  deprioritized_reason: string | null
}

// ── Scoring weights ───────────────────────────────────────────────────────────

const W = {
  WORKSPACE_MATCH:      40,
  CASE_LINK:            20,
  WORKFLOW_LINK:        20,
  MODE_MATCH:           15,
  TIER_HOT:             20,
  TIER_WARM:            12,
  TIER_COLD:             6,
  PRIORITY_MAX:         20,   // retrieval_priority (0–10) * 2
  TRUST_MAX:            15,   // trust_score (0–1) * 15
  RECENCY_MAX:          10,   // recency_score (0–1) * 10
  WORKFLOW_REL_MAX:     10,   // workflow_relevance_score (0–1) * 10
  RETRIEVAL_BONUS_MAX:   8,   // retrieval_count bonus (capped, Phase 6)
  GLOBAL_FALLBACK_PEN: -10,
  COLD_TIER_PEN:        -5,
} as const

function retrievalBonus(count: number): number {
  if (count === 0)  return 0
  if (count  < 3)   return 2
  if (count  < 10)  return 4
  if (count  < 25)  return 6
  return W.RETRIEVAL_BONUS_MAX
}

function tierScore(tier: string): number {
  if (tier === 'hot')  return W.TIER_HOT
  if (tier === 'warm') return W.TIER_WARM
  return W.TIER_COLD
}

// ── calculateWorkspaceMemoryScore ─────────────────────────────────────────────

export function calculateWorkspaceMemoryScore(
  item:          RawMemoryRow,
  workspaceId:   string | null,
  selectedModes: MemoryMode[],
  opts: {
    globalFallback: boolean  // true when workspace items are sparse
    caseId?:        string | null
    workflowId?:    string | null
  },
): ScoreBreakdown {
  const scope: ItemScope = (workspaceId && item.workspace_id === workspaceId)
    ? 'workspace' : 'global'

  const workspace_match    = scope === 'workspace' ? W.WORKSPACE_MATCH : 0
  const case_link          = (opts.caseId && item.linked_case_id === opts.caseId) ? W.CASE_LINK : 0
  const workflow_link      = (opts.workflowId && item.linked_workflow_id === opts.workflowId) ? W.WORKFLOW_LINK : 0
  const mode_match         = selectedModes.includes(item.memory_mode as MemoryMode) ? W.MODE_MATCH : 0
  const temperature        = tierScore(item.temperature_tier)
  const priority           = ((item.retrieval_priority ?? 0) / 10) * W.PRIORITY_MAX
  const trust              = (item.trust_score ?? 0) * W.TRUST_MAX
  const recency            = (item.recency_score ?? 0) * W.RECENCY_MAX
  const workflow_relevance = (item.workflow_relevance_score ?? 0) * W.WORKFLOW_REL_MAX
  const retrieval_bonus    = retrievalBonus(item.retrieval_count ?? 0)

  let penalties = 0
  if (scope === 'global' && opts.globalFallback) penalties += W.GLOBAL_FALLBACK_PEN
  if (item.temperature_tier === 'cold')          penalties += W.COLD_TIER_PEN

  const total = workspace_match + case_link + workflow_link + mode_match
    + temperature + priority + trust + recency + workflow_relevance + retrieval_bonus + penalties

  return {
    workspace_match,
    case_link,
    workflow_link,
    mode_match,
    temperature,
    priority:           round1(priority),
    trust:              round1(trust),
    recency:            round1(recency),
    workflow_relevance: round1(workflow_relevance),
    retrieval_bonus,
    penalties,
    total:              round1(total),
  }
}

function round1(n: number) { return Math.round(n * 10) / 10 }

// ── rankWorkspaceMemoryItems ──────────────────────────────────────────────────

export function rankWorkspaceMemoryItems(
  rawItems:      RawMemoryRow[],
  workspaceId:   string | null,
  selectedModes: MemoryMode[],
  opts: {
    globalFallback: boolean
    caseId?:        string | null
    workflowId?:    string | null
  },
): ScoredMemoryItem[] {
  return rawItems
    .map(item => {
      const scope: ItemScope = (workspaceId && item.workspace_id === workspaceId)
        ? 'workspace' : 'global'
      const breakdown = calculateWorkspaceMemoryScore(item, workspaceId, selectedModes, opts)

      // Build included reason
      const reasons: string[] = []
      if (scope === 'workspace')         reasons.push('workspace match')
      if (breakdown.case_link > 0)       reasons.push('case linked')
      if (breakdown.workflow_link > 0)   reasons.push('workflow linked')
      if (breakdown.mode_match > 0)      reasons.push(`mode: ${item.memory_mode}`)
      if (breakdown.temperature >= W.TIER_HOT)  reasons.push('hot tier')
      else if (breakdown.temperature >= W.TIER_WARM) reasons.push('warm tier')
      if (breakdown.trust >= 12)         reasons.push('high trust')
      if (breakdown.recency >= 8)        reasons.push('high recency')
      if (reasons.length === 0)          reasons.push('default retrieval')

      // Build deprioritized reason
      const deprio: string[] = []
      if (scope === 'global' && opts.globalFallback) deprio.push('global fallback')
      if (breakdown.penalties <= W.COLD_TIER_PEN)    deprio.push('cold tier')
      if (breakdown.mode_match === 0)                deprio.push('mode mismatch')

      return {
        ...item,
        scope,
        workspace_score:      breakdown.total,
        score_breakdown:      breakdown,
        included_reason:      reasons.join(' · '),
        deprioritized_reason: deprio.length > 0 ? deprio.join(' · ') : null,
      }
    })
    .sort((a, b) => b.workspace_score - a.workspace_score)
}

// ── explainWorkspaceWeighting ─────────────────────────────────────────────────

export function explainWorkspaceWeighting(
  items:          ScoredMemoryItem[],
  workspaceId:    string | null,
  globalFallback: boolean,
): string {
  const wsCount  = items.filter(i => i.scope === 'workspace').length
  const glbCount = items.filter(i => i.scope === 'global').length
  const top      = items[0]

  const parts: string[] = []
  parts.push(`${items.length} item(s) scored — ${wsCount} workspace, ${glbCount} global`)
  if (!workspaceId)     parts.push('no workspace ID — all global')
  if (globalFallback)   parts.push('global fallback active (workspace items sparse)')
  if (top) parts.push(`top: "${top.title}" score=${top.workspace_score} scope=${top.scope}`)

  return parts.join(' · ')
}
