import type { ClassificationResult, MemoryLayer } from '@/types'

// ── Keyword sets ──────────────────────────────────────────────────────────────

const THINK_TANK_KW = [
  'idea', 'hypothesis', 'what if', 'explore', 'brainstorm', 'speculative',
  'maybe we could', 'thought experiment', 'wild idea', 'blue sky', 'musing',
  'theoretical', 'just thinking', 'rough concept',
]

const CASE_KW = [
  'case', 'incident', 'issue', 'escalation', 'complaint', 'ticket',
  'dispute', 'claim', 'matter', 'investigation', 'resolution',
]

const WORKFLOW_KW = [
  'workflow', 'automation', 'trigger', 'pipeline', 'process output',
  'batch run', 'scheduled', 'job result', 'workflow output', 'cron',
]

const RESEARCH_KW = [
  'research', 'market', 'intelligence', 'analysis', 'report', 'study',
  'survey', 'data', 'insight', 'trend', 'news', 'competitive', 'findings',
]

const VAULT_KW = [
  'contract', 'agreement', 'policy', 'procedure', 'manual', 'document',
  'certificate', 'official', 'signed', 'legal', 'sop', 'guideline',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function countHits(text: string, keywords: string[]): number {
  const t = text.toLowerCase()
  return keywords.filter(kw => t.includes(kw)).length
}

type LayerConfig = Pick<ClassificationResult, 'category' | 'authority_level' | 'retrieval_priority'>

const LAYER_CONFIG: Record<MemoryLayer, LayerConfig> = {
  vault:           { category: 'document',        authority_level: 'high',      retrieval_priority: 7 },
  cases:           { category: 'case_context',    authority_level: 'very_high', retrieval_priority: 9 },
  workflow_memory: { category: 'workflow_output', authority_level: 'very_high', retrieval_priority: 8 },
  think_tank:      { category: 'speculative',     authority_level: 'low',       retrieval_priority: 2 },
  research:        { category: 'research',        authority_level: 'medium',    retrieval_priority: 5 },
  archive:         { category: 'archived',        authority_level: 'low',       retrieval_priority: 1 },
}

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyOperationalMemoryItem(
  title: string,
  content: string,
  source_type: string,
): ClassificationResult {
  const combined = `${title} ${content}`

  // Think tank — check first. Speculative content is always isolated.
  if (countHits(combined, THINK_TANK_KW) >= 1 && source_type !== 'upload') {
    return {
      memory_layer:             'think_tank',
      category:                 'speculative',
      authority_level:          'low',
      retrieval_priority:       2,
      assistant_default_access: false,
      status:                   'active',
    }
  }

  // Uploads default to vault unless strong case signal overrides
  if (source_type === 'upload') {
    const caseScore  = countHits(combined, CASE_KW)
    const vaultScore = countHits(combined, VAULT_KW)
    const layer: MemoryLayer = caseScore >= 2 && caseScore > vaultScore ? 'cases' : 'vault'
    return { memory_layer: layer, ...LAYER_CONFIG[layer], assistant_default_access: true, status: 'active' }
  }

  // Score remaining layers
  const scores: Partial<Record<MemoryLayer, number>> = {
    vault:           countHits(combined, VAULT_KW),
    cases:           countHits(combined, CASE_KW),
    workflow_memory: countHits(combined, WORKFLOW_KW),
    research:        countHits(combined, RESEARCH_KW),
  }

  // Source-type boosts
  if (source_type === 'workflow' || source_type === 'log') scores.workflow_memory = (scores.workflow_memory ?? 0) + 3
  if (source_type === 'transcript' || source_type === 'handover') {
    scores.cases    = (scores.cases    ?? 0) + 2
    scores.research = (scores.research ?? 0) + 1
  }
  if (source_type === 'strategy') scores.research = (scores.research ?? 0) + 2

  const winner = (Object.entries(scores) as [MemoryLayer, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0]

  const layer: MemoryLayer = winner?.[0] ?? 'research'
  return { memory_layer: layer, ...LAYER_CONFIG[layer], assistant_default_access: true, status: 'active' }
}
