import type { MemoryLayer } from '@/types'

// ── Term sets ─────────────────────────────────────────────────────────────────

const CASE_TERMS      = ['case', 'incident', 'issue', 'escalation', 'matter', 'ticket', 'dispute', 'claim']
const WORKFLOW_TERMS  = ['workflow', 'automation', 'pipeline', 'trigger', 'job', 'process', 'scheduled']
const RESEARCH_TERMS  = ['research', 'intel', 'analysis', 'market', 'trend', 'report', 'news', 'findings']
const VAULT_TERMS     = ['document', 'contract', 'policy', 'file', 'upload', 'vault', 'sop']
const THINKTANK_TERMS = ['think tank', 'speculative', 'brainstorm', 'hypothesis', 'blue sky', 'idea bank']

// ── Retrieval policy ──────────────────────────────────────────────────────────

interface RetrievalContext {
  pathname?: string
}

function hits(query: string, terms: string[]): boolean {
  const q = query.toLowerCase()
  return terms.some(t => q.includes(t))
}

function push(arr: MemoryLayer[], layer: MemoryLayer) {
  if (!arr.includes(layer)) arr.push(layer)
}

function unshift(arr: MemoryLayer[], layer: MemoryLayer) {
  if (!arr.includes(layer)) arr.unshift(layer)
}

export function getRelevantMemoryLayers(
  query: string,
  context: RetrievalContext = {},
): MemoryLayer[] {
  // Think tank is isolated — only returned when explicitly requested
  if (hits(query, THINKTANK_TERMS) || context.pathname?.startsWith('/think-tank')) {
    return ['think_tank']
  }

  const layers: MemoryLayer[] = []

  // Path-based defaults
  if (context.pathname?.startsWith('/cases'))     { push(layers, 'cases'); push(layers, 'vault') }
  if (context.pathname?.startsWith('/workflows')) { push(layers, 'workflow_memory'); push(layers, 'cases') }
  if (context.pathname?.startsWith('/vault'))     { push(layers, 'vault'); push(layers, 'research') }

  // Query-signal boosts
  if (hits(query, CASE_TERMS))     unshift(layers, 'cases')
  if (hits(query, WORKFLOW_TERMS)) unshift(layers, 'workflow_memory')
  if (hits(query, RESEARCH_TERMS)) push(layers, 'research')
  if (hits(query, VAULT_TERMS))    push(layers, 'vault')

  // Default operational set — think_tank never included
  if (layers.length === 0) {
    return ['cases', 'vault', 'workflow_memory', 'research']
  }

  return layers
}
