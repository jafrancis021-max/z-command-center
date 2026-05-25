import { getAdmin } from '@/lib/supabase-server'
import {
  inferRetrievalIntent,
  getMemoryModesForIntent,
  getRelevantMemoryLayers,
  isSpeculativeIntent,
} from '@/lib/retrieval-policy'
import {
  rankWorkspaceMemoryItems,
  explainWorkspaceWeighting,
  type RawMemoryRow,
  type ScoredMemoryItem,
} from '@/lib/memory-weighting'
import type { MemoryMode, TemperatureTier, RetrievalIntent } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

// If fewer than this many workspace items are found, pull in global items too
const MIN_WS_ITEMS = 3
const FETCH_LIMIT  = 20   // raw fetch ceiling before scoring
const TOP_N        = 8    // final items returned to the model

const SELECT_COLS = [
  'id', 'title', 'content', 'memory_layer', 'memory_mode', 'category',
  'temperature_tier', 'trust_score', 'retrieval_priority',
  'workspace_id', 'recency_score', 'workflow_relevance_score',
  'linked_case_id', 'linked_workflow_id',
  // Phase 6 — freshness fields
  'authority_level', 'last_retrieved_at', 'retrieval_count',
].join(', ')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssistantContextPayload {
  intent:               RetrievalIntent
  selectedModes:        MemoryMode[]
  excludedModes:        MemoryMode[]
  speculativeBlocked:   boolean
  temperatureWeighting: { hot: number; warm: number; cold: number }
  items:                ScoredMemoryItem[]
  contextText:          string
  // Phase 5 — workspace scope stats
  workspaceId:              string | null
  workspaceScopedCount:     number
  globalFallbackCount:      number
  globalFallbackUsed:       boolean
  topMemoryScore:           number
  weightingExplanation:     string
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchWorkspaceItems(
  db:           ReturnType<typeof getAdmin>,
  modes:        MemoryMode[],
  layers:       string[],
  workspaceId:  string,
): Promise<RawMemoryRow[]> {
  const { data } = await db
    .from('operational_memory_items')
    .select(SELECT_COLS)
    .in('memory_mode', modes)
    .in('memory_layer', layers)
    .eq('assistant_default_access', true)
    .eq('status', 'active')
    .eq('workspace_id', workspaceId)
    .limit(FETCH_LIMIT)

  return (data ?? []) as unknown as RawMemoryRow[]
}

async function fetchGlobalItems(
  db:     ReturnType<typeof getAdmin>,
  modes:  MemoryMode[],
  layers: string[],
): Promise<RawMemoryRow[]> {
  const { data } = await db
    .from('operational_memory_items')
    .select(SELECT_COLS)
    .in('memory_mode', modes)
    .in('memory_layer', layers)
    .eq('assistant_default_access', true)
    .eq('status', 'active')
    .is('workspace_id', null)
    .limit(FETCH_LIMIT)

  return (data ?? []) as unknown as RawMemoryRow[]
}

async function fetchAllItems(
  db:     ReturnType<typeof getAdmin>,
  modes:  MemoryMode[],
  layers: string[],
): Promise<RawMemoryRow[]> {
  const { data } = await db
    .from('operational_memory_items')
    .select(SELECT_COLS)
    .in('memory_mode', modes)
    .in('memory_layer', layers)
    .eq('assistant_default_access', true)
    .eq('status', 'active')
    .limit(FETCH_LIMIT)

  return (data ?? []) as unknown as RawMemoryRow[]
}

// ── Assembler ─────────────────────────────────────────────────────────────────

export async function assembleAssistantContext(
  userMessage: string,
  workspaceId: string | null,
  options?: { caseId?: string; workflowId?: string; pathname?: string },
): Promise<AssistantContextPayload> {
  const intent             = inferRetrievalIntent(userMessage)
  const speculativeBlocked = !isSpeculativeIntent(intent)

  const requestedModes = getMemoryModesForIntent(intent)
  const activeModes    = speculativeBlocked
    ? requestedModes.filter(m => m !== 'speculative')
    : requestedModes
  const excludedModes: MemoryMode[] = speculativeBlocked ? ['speculative'] : []

  // Think Tank blocked unless speculative intent (never override this)
  const allowedLayers  = getRelevantMemoryLayers(userMessage, { pathname: options?.pathname })
  const queryLayers    = speculativeBlocked
    ? allowedLayers.filter(l => l !== 'think_tank')
    : allowedLayers
  const effectiveLayers = queryLayers.length > 0
    ? queryLayers
    : ['cases', 'vault', 'workflow_memory', 'research']

  const db = getAdmin()
  let rawItems: RawMemoryRow[]
  let globalFallback = false

  if (workspaceId) {
    // Stage 1: workspace-specific items
    const wsItems = await fetchWorkspaceItems(db, activeModes, effectiveLayers, workspaceId)

    if (wsItems.length >= MIN_WS_ITEMS) {
      // Enough workspace items — no global fallback needed
      rawItems = wsItems
    } else {
      // Stage 2: supplement with global (workspace_id IS NULL) items
      const [glbItems] = await Promise.all([
        fetchGlobalItems(db, activeModes, effectiveLayers),
      ])
      globalFallback = glbItems.length > 0
      // Deduplicate by id (shouldn't overlap, but safety)
      const seen = new Set(wsItems.map(i => i.id))
      rawItems = [...wsItems, ...glbItems.filter(i => !seen.has(i.id))]
    }
  } else {
    // No workspace context — fetch all items (original behavior)
    rawItems = await fetchAllItems(db, activeModes, effectiveLayers)
    globalFallback = rawItems.length > 0
  }

  // Apply workspace scoring and rank
  const ranked = rankWorkspaceMemoryItems(rawItems, workspaceId, activeModes, {
    globalFallback,
    caseId:     options?.caseId,
    workflowId: options?.workflowId,
  })

  const items = ranked.slice(0, TOP_N)

  // Workspace scope stats
  const workspaceScopedCount = items.filter(i => i.scope === 'workspace').length
  const globalFallbackCount  = items.filter(i => i.scope === 'global').length
  const globalFallbackUsed   = globalFallbackCount > 0
  const topMemoryScore       = items[0]?.workspace_score ?? 0

  // Temperature distribution
  const temperatureWeighting = { hot: 0, warm: 0, cold: 0 }
  for (const item of items) {
    const t = item.temperature_tier as TemperatureTier
    if (t in temperatureWeighting) temperatureWeighting[t]++
  }

  // Context text for system prompt (include scope tag)
  const contextText = items.length > 0
    ? 'MEMORY CONTEXT:\n' + items.map(m =>
        `  [${(m.memory_mode as string).toUpperCase()}][${(m.temperature_tier as string).toUpperCase()}]` +
        `[${m.scope.toUpperCase()}][${m.category}] ${m.title}: ${(m.content as string).slice(0, 150)}`
      ).join('\n')
    : ''

  const weightingExplanation = explainWorkspaceWeighting(items, workspaceId, globalFallbackUsed)

  return {
    intent,
    selectedModes:    activeModes,
    excludedModes,
    speculativeBlocked,
    temperatureWeighting,
    items,
    contextText,
    workspaceId,
    workspaceScopedCount,
    globalFallbackCount,
    globalFallbackUsed,
    topMemoryScore,
    weightingExplanation,
  }
}
