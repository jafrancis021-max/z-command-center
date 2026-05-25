import { getAdmin } from '@/lib/supabase-server'
import type { TemperatureTier } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FreshnessInput {
  id:                    string
  title:                 string
  memory_mode:           string
  memory_layer:          string
  authority_level:       string
  temperature_tier:      string
  recency_score:         number
  retrieval_decay_factor: number
  retrieval_count:       number
  linked_case_id:        string | null
  linked_workflow_id:    string | null
  status:                string
  created_at:            string
  updated_at:            string
  last_retrieved_at:     string | null
  last_accessed_at:      string | null
  freshness_checked_at:  string | null
}

export interface FreshnessDecision {
  id:                     string
  title:                  string
  current_tier:           TemperatureTier
  proposed_tier:          TemperatureTier
  current_recency_score:  number
  proposed_recency_score: number
  should_cool:            boolean
  protected:              boolean
  protection_reason:      string | null
  proposed_decay_factor:  number
  retrieval_count:        number
  days_since_retrieved:   number | null
  explanation:            string
}

export interface DecayResult {
  dry_run:        boolean
  checked_at:     string
  items_checked:  number
  items_cooled:   number
  items_protected: number
  items_unchanged: number
  decisions:      FreshnessDecision[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function mostRecentTimestamp(item: FreshnessInput): string {
  const candidates = [item.last_retrieved_at, item.last_accessed_at, item.updated_at, item.created_at]
    .filter(Boolean) as string[]
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

const TIER_RANK: Record<string, number> = { hot: 3, warm: 2, cold: 1 }

// ── calculateRecencyScore ─────────────────────────────────────────────────────
// Returns 0–1 based on how recently the item was accessed/retrieved.

export function calculateRecencyScore(item: FreshnessInput): number {
  const reference = mostRecentTimestamp(item)
  const days      = daysSince(reference) ?? 999

  // Items that have been explicitly retrieved use a faster-decaying curve
  const hasRetrieval = item.last_retrieved_at !== null

  if (hasRetrieval) {
    const retrievalDays = daysSince(item.last_retrieved_at) ?? days
    if (retrievalDays <  1)  return 1.0
    if (retrievalDays <  3)  return 0.9
    if (retrievalDays <  7)  return 0.75
    if (retrievalDays < 14)  return 0.55
    if (retrievalDays < 30)  return 0.35
    if (retrievalDays < 60)  return 0.2
    return 0.1
  }

  // Creation/update only — slower decay
  if (days <  1)  return 0.9
  if (days <  3)  return 0.75
  if (days <  7)  return 0.6
  if (days < 14)  return 0.45
  if (days < 30)  return 0.3
  if (days < 60)  return 0.18
  if (days < 90)  return 0.1
  return 0.05
}

// ── calculateRetrievalDecayFactor ─────────────────────────────────────────────
// Frequently retrieved items decay more slowly.

export function calculateRetrievalDecayFactor(item: FreshnessInput): number {
  const count = item.retrieval_count
  if (count === 0)  return 0.82
  if (count  < 3)   return 0.88
  if (count  < 10)  return 0.93
  if (count  < 25)  return 0.96
  return 0.98
}

// ── calculateFreshTemperatureTier ─────────────────────────────────────────────
// Determines target tier from recency score. Never promotes via decay.

export function calculateFreshTemperatureTier(
  item:           FreshnessInput,
  newRecencyScore: number,
): TemperatureTier {
  const proposed: TemperatureTier =
    newRecencyScore >= 0.65 ? 'hot'  :
    newRecencyScore >= 0.32 ? 'warm' : 'cold'

  // Decay route never promotes — cap at current tier
  const current = item.temperature_tier as TemperatureTier
  const proposedRank = TIER_RANK[proposed] ?? 1
  const currentRank  = TIER_RANK[current]  ?? 1

  return proposedRank <= currentRank ? proposed : current
}

// ── Protection rules ──────────────────────────────────────────────────────────

interface ProtectionResult {
  protected:       boolean
  protectionReason: string | null
}

function checkProtection(item: FreshnessInput, proposedTier: TemperatureTier): ProtectionResult {
  const current = item.temperature_tier as TemperatureTier

  // No change — nothing to protect
  if (proposedTier === current) {
    return { protected: false, protectionReason: null }
  }

  // 1. runtime hot — fully frozen
  if (item.memory_mode === 'runtime' && current === 'hot') {
    return { protected: true, protectionReason: 'runtime hot — frozen by policy' }
  }

  // 2. very_high authority — floor is warm
  if (item.authority_level === 'very_high' && proposedTier === 'cold') {
    return { protected: true, protectionReason: 'very_high authority — floor is warm' }
  }

  // 3. case-linked — floor is warm
  if (item.linked_case_id && proposedTier === 'cold') {
    return { protected: true, protectionReason: 'linked to active case — floor is warm' }
  }

  // 4. workflow-linked — floor is warm
  if (item.linked_workflow_id && proposedTier === 'cold') {
    return { protected: true, protectionReason: 'linked to workflow — floor is warm' }
  }

  // 5. procedural retrieved recently
  if (item.memory_mode === 'procedural' && item.last_retrieved_at) {
    const days = daysSince(item.last_retrieved_at) ?? 999
    if (days < 7) {
      return { protected: true, protectionReason: 'procedural — retrieved within 7 days' }
    }
  }

  // 6. frequently retrieved
  if (item.retrieval_count >= 10 && proposedTier === 'cold') {
    return { protected: true, protectionReason: 'retrieval_count ≥ 10 — floor is warm' }
  }

  return { protected: false, protectionReason: null }
}

// ── shouldCoolMemoryItem ──────────────────────────────────────────────────────

export function shouldCoolMemoryItem(
  item:        FreshnessInput,
  proposedTier: TemperatureTier,
): { shouldCool: boolean; protected: boolean; protectionReason: string | null } {
  const current = item.temperature_tier as TemperatureTier

  if (TIER_RANK[proposedTier] >= TIER_RANK[current]) {
    // Same or higher — nothing to cool
    return { shouldCool: false, protected: false, protectionReason: null }
  }

  const protection = checkProtection(item, proposedTier)
  return {
    shouldCool:      !protection.protected,
    protected:        protection.protected,
    protectionReason: protection.protectionReason,
  }
}

// ── explainFreshnessDecision ──────────────────────────────────────────────────

export function explainFreshnessDecision(item: FreshnessInput): FreshnessDecision {
  const newRecencyScore  = calculateRecencyScore(item)
  const newDecayFactor   = calculateRetrievalDecayFactor(item)
  const proposedTier     = calculateFreshTemperatureTier(item, newRecencyScore)
  const cooling          = shouldCoolMemoryItem(item, proposedTier)
  const daysRetrieved    = daysSince(item.last_retrieved_at)

  const parts: string[] = []
  parts.push(`recency: ${newRecencyScore.toFixed(2)} (was ${item.recency_score.toFixed(2)})`)
  parts.push(`tier: ${item.temperature_tier} → ${proposedTier}`)
  parts.push(`decay_factor: ${newDecayFactor.toFixed(2)}`)
  if (daysRetrieved !== null) parts.push(`last retrieved: ${daysRetrieved.toFixed(1)}d ago`)
  if (item.retrieval_count > 0) parts.push(`retrieved ${item.retrieval_count}× total`)
  if (cooling.protected) parts.push(`protected: ${cooling.protectionReason}`)

  return {
    id:                     item.id,
    title:                  item.title,
    current_tier:           item.temperature_tier as TemperatureTier,
    proposed_tier:          proposedTier,
    current_recency_score:  item.recency_score,
    proposed_recency_score: newRecencyScore,
    should_cool:            cooling.shouldCool,
    protected:              cooling.protected,
    protection_reason:      cooling.protectionReason,
    proposed_decay_factor:  newDecayFactor,
    retrieval_count:        item.retrieval_count,
    days_since_retrieved:   daysRetrieved !== null ? Math.round(daysRetrieved * 10) / 10 : null,
    explanation:            parts.join(' · '),
  }
}

// ── recordMemoryRetrieval ─────────────────────────────────────────────────────
// Called fire-and-forget via after() in the chat route.

export async function recordMemoryRetrieval(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await getAdmin().rpc('increment_memory_retrieval', { item_ids: ids })
  } catch (err) {
    console.error('[memory-freshness] recordMemoryRetrieval failed:', err)
  }
}

// ── applyDecay ────────────────────────────────────────────────────────────────
// Fetches all active items, computes freshness decisions, optionally writes.

const DECAY_SELECT = [
  'id', 'title', 'memory_mode', 'memory_layer', 'authority_level',
  'temperature_tier', 'recency_score', 'retrieval_decay_factor', 'retrieval_count',
  'linked_case_id', 'linked_workflow_id', 'status',
  'created_at', 'updated_at', 'last_retrieved_at', 'last_accessed_at', 'freshness_checked_at',
].join(', ')

export async function applyDecay(opts: {
  dryRun:     boolean
  batchSize?: number
}): Promise<DecayResult> {
  const db          = getAdmin()
  const checkedAt   = new Date().toISOString()
  const batchSize   = opts.batchSize ?? 200

  const { data: rows } = await db
    .from('operational_memory_items')
    .select(DECAY_SELECT)
    .eq('status', 'active')
    .limit(batchSize)
    .order('freshness_checked_at', { ascending: true, nullsFirst: true })

  const items = (rows ?? []) as unknown as FreshnessInput[]
  const decisions = items.map(item => explainFreshnessDecision(item))

  let itemsCooled   = 0
  let itemsProtected = 0
  let itemsUnchanged = 0

  if (!opts.dryRun) {
    for (const d of decisions) {
      if (d.should_cool) {
        await db
          .from('operational_memory_items')
          .update({
            temperature_tier:     d.proposed_tier,
            recency_score:        d.proposed_recency_score,
            retrieval_decay_factor: d.proposed_decay_factor,
            freshness_checked_at: checkedAt,
          })
          .eq('id', d.id)
        itemsCooled++
      } else {
        // Always update recency_score and freshness_checked_at even if no tier change
        await db
          .from('operational_memory_items')
          .update({
            recency_score:        d.proposed_recency_score,
            retrieval_decay_factor: d.proposed_decay_factor,
            freshness_checked_at: checkedAt,
          })
          .eq('id', d.id)

        if (d.protected) itemsProtected++
        else itemsUnchanged++
      }
    }
  } else {
    for (const d of decisions) {
      if (d.should_cool) itemsCooled++
      else if (d.protected) itemsProtected++
      else itemsUnchanged++
    }
  }

  return {
    dry_run:        opts.dryRun,
    checked_at:     checkedAt,
    items_checked:  items.length,
    items_cooled:   itemsCooled,
    items_protected: itemsProtected,
    items_unchanged: itemsUnchanged,
    decisions,
  }
}
