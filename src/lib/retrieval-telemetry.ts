import { getAdmin } from '@/lib/supabase-server'
import { createOperationalEvent } from '@/lib/operational-events'
import type { OperationalEvent } from '@/lib/operational-events'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievalTelemetryOpts {
  userMessage:          string
  workspaceId:          string | null
  intent:               string
  selectedModes:        string[]
  excludedModes:        string[]
  speculativeBlocked:   boolean
  workspaceScopedCount: number
  globalFallbackCount:  number
  globalFallbackUsed:   boolean
  topMemoryScore:       number
  itemIds:              string[]
  itemCount:            number
  temperatureDist:      { hot: number; warm: number; cold: number }
}

export interface TelemetrySummary {
  total_retrievals:          number
  counts_by_intent:          Record<string, number>
  speculative_blocked_count: number
  avg_top_memory_score:      number
  workspace_pct:             number
  global_pct:                number
  top_modes:                 Array<{ mode: string; count: number }>
  recent_item_ids:           string[]
}

// ── recordRetrievalTelemetry ──────────────────────────────────────────────────
// Call fire-and-forget via after() in the chat route.

export async function recordRetrievalTelemetry(opts: RetrievalTelemetryOpts): Promise<void> {
  const title = `Retrieval: intent=${opts.intent} · ${opts.itemCount} item(s) · ws=${opts.workspaceScopedCount}/global=${opts.globalFallbackCount}`

  await createOperationalEvent({
    workspace_id:     opts.workspaceId,
    event_type:       'assistant.retrieval_telemetry',
    event_source:     'assistant',
    entity_type:      'retrieval',
    title,
    metadata: {
      intent:                  opts.intent,
      selected_modes:          opts.selectedModes,
      excluded_modes:          opts.excludedModes,
      speculative_blocked:     opts.speculativeBlocked,
      workspace_id:            opts.workspaceId,
      workspace_scoped_count:  opts.workspaceScopedCount,
      global_fallback_count:   opts.globalFallbackCount,
      global_fallback_used:    opts.globalFallbackUsed,
      top_memory_score:        opts.topMemoryScore,
      item_ids:                opts.itemIds,
      item_count:              opts.itemCount,
      temperature_dist:        opts.temperatureDist,
      user_message_preview:    opts.userMessage.slice(0, 80),
    },
    importance_score: 0.3,
    memory_mode:      'runtime',
    temperature_tier: 'warm',
  })
}

// ── getRecentRetrievalTelemetry ───────────────────────────────────────────────

export async function getRecentRetrievalTelemetry(limit = 50): Promise<OperationalEvent[]> {
  const { data } = await getAdmin()
    .from('operational_events')
    .select('*')
    .eq('event_type', 'assistant.retrieval_telemetry')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as OperationalEvent[]
}

// ── summarizeFromEvents ───────────────────────────────────────────────────────
// Pure aggregation — no DB calls.

export function summarizeFromEvents(events: OperationalEvent[]): TelemetrySummary {
  const counts_by_intent: Record<string, number> = {}
  const mode_counts:       Record<string, number> = {}
  let speculative_blocked_count = 0
  let total_top_score           = 0
  let workspace_only_count      = 0
  const seen_ids                = new Set<string>()
  const recent_item_ids: string[] = []

  for (const ev of events) {
    const meta = (ev.metadata ?? {}) as Record<string, unknown>

    const intent = typeof meta.intent === 'string' ? meta.intent : 'unknown'
    counts_by_intent[intent] = (counts_by_intent[intent] ?? 0) + 1

    if (meta.speculative_blocked === true) speculative_blocked_count++

    total_top_score += typeof meta.top_memory_score === 'number' ? meta.top_memory_score : 0

    if (!(meta.global_fallback_used as boolean)) workspace_only_count++

    const modes = Array.isArray(meta.selected_modes) ? (meta.selected_modes as string[]) : []
    for (const m of modes) {
      mode_counts[m] = (mode_counts[m] ?? 0) + 1
    }

    const ids = Array.isArray(meta.item_ids) ? (meta.item_ids as string[]) : []
    for (const id of ids) {
      if (typeof id === 'string' && !seen_ids.has(id) && recent_item_ids.length < 20) {
        seen_ids.add(id)
        recent_item_ids.push(id)
      }
    }
  }

  const total = events.length
  const top_modes = Object.entries(mode_counts)
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    total_retrievals:          total,
    counts_by_intent,
    speculative_blocked_count,
    avg_top_memory_score:      total > 0 ? Math.round((total_top_score / total) * 10) / 10 : 0,
    workspace_pct:             total > 0 ? Math.round((workspace_only_count / total) * 100) : 0,
    global_pct:                total > 0 ? Math.round(((total - workspace_only_count) / total) * 100) : 0,
    top_modes,
    recent_item_ids,
  }
}
