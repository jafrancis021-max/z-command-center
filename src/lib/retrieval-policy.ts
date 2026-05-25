import type { MemoryLayer, MemoryMode, RetrievalIntent } from '@/types'

// ── Term sets ─────────────────────────────────────────────────────────────────

const CASE_TERMS      = ['case', 'incident', 'issue', 'escalation', 'matter', 'ticket', 'dispute', 'claim']
const WORKFLOW_TERMS  = ['workflow', 'automation', 'pipeline', 'trigger', 'job', 'process', 'scheduled']
const RESEARCH_TERMS  = ['research', 'intel', 'analysis', 'market', 'trend', 'report', 'news', 'findings']
const VAULT_TERMS     = ['document', 'contract', 'policy', 'file', 'upload', 'vault', 'sop']
const THINKTANK_TERMS = ['think tank', 'speculative', 'brainstorm', 'hypothesis', 'blue sky', 'idea bank']

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Layer-based retrieval (path + query signal) ───────────────────────────────

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

// ── Intent inference ──────────────────────────────────────────────────────────

export function inferRetrievalIntent(query: string): RetrievalIntent {
  const q = query.toLowerCase()

  if (/what (happened|occurred|went wrong|was the outcome|did we|was said|was decided)/.test(q)
    || /tell me (about|what happened)/.test(q)
    || /history of|recap|last time/.test(q)) {
    return 'episodic'
  }

  if (/what do (we|I) know|what('s| is) (known|the background|the context|our understanding|the situation)/.test(q)
    || /give me (context|background|an overview|a summary)/.test(q)) {
    return 'semantic'
  }

  if (/how do (we|I|you) (do|handle|process|run|execute|manage)|what('s| is) the (process|procedure|steps|sop|protocol)/.test(q)
    || /walk me through|step by step|how should (we|I)/.test(q)) {
    return 'procedural'
  }

  if (/what am I working on|what('s| is) (active|in progress|current|pending|my queue|on my plate)/.test(q)
    || /my (tasks|cases|queue|priorities|workload)|what (should I|do I) (focus|work|do) (on|next)/.test(q)) {
    return 'working'
  }

  if (/system (health|status|uptime|errors|performance)|runtime|infrastructure|service (status|health)|is .* (up|down|running|healthy)/.test(q)
    || /operational status|system check|health check/.test(q)) {
    return 'runtime'
  }

  if (/brainstorm|think tank|ideas|speculative|what if|explore|hypothesis|blue sky|let's think/.test(q)) {
    return 'speculative'
  }

  // Default: semantic — answer "what do we know" about this topic
  return 'semantic'
}

// ── Mode mapping ──────────────────────────────────────────────────────────────

const INTENT_MODES: Record<RetrievalIntent, MemoryMode[]> = {
  working:    ['working', 'episodic'],
  episodic:   ['episodic', 'working'],
  semantic:   ['semantic', 'procedural'],
  procedural: ['procedural', 'semantic'],
  runtime:    ['runtime', 'semantic'],
  speculative: ['speculative'],
}

export function getMemoryModesForIntent(intent: RetrievalIntent): MemoryMode[] {
  return INTENT_MODES[intent]
}

export function isSpeculativeIntent(intent: RetrievalIntent): boolean {
  return intent === 'speculative'
}
