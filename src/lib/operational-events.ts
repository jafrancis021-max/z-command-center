import { getAdmin } from '@/lib/supabase-server'
import type { MemoryMode, TemperatureTier } from '@/types'

// ── Event payload ─────────────────────────────────────────────────────────────

export interface OperationalEventPayload {
  workspace_id?:    string | null
  event_type:       string
  event_source?:    string
  entity_type?:     string
  entity_id?:       string
  title:            string
  description?:     string
  metadata?:        Record<string, unknown>
  actor_id?:        string
  importance_score?: number
  memory_mode?:     MemoryMode
  temperature_tier?: TemperatureTier
}

export interface OperationalEvent extends Required<Omit<OperationalEventPayload, 'description'>> {
  id:          string
  description: string | null
  created_at:  string
}

// ── createOperationalEvent ────────────────────────────────────────────────────
// Fire-and-forget — never throws, never blocks the caller.

export async function createOperationalEvent(payload: OperationalEventPayload): Promise<void> {
  try {
    await getAdmin().from('operational_events').insert({
      workspace_id:    payload.workspace_id    ?? null,
      event_type:      payload.event_type,
      event_source:    payload.event_source    ?? 'system',
      entity_type:     payload.entity_type     ?? null,
      entity_id:       payload.entity_id       ?? null,
      title:           payload.title,
      description:     payload.description     ?? null,
      metadata:        payload.metadata        ?? {},
      actor_id:        payload.actor_id        ?? null,
      importance_score: payload.importance_score ?? 0.5,
      memory_mode:     payload.memory_mode     ?? 'episodic',
      temperature_tier: payload.temperature_tier ?? 'warm',
    })
  } catch (err) {
    console.error('[operational-events] createOperationalEvent failed:', err)
  }
}

// ── getRecentOperationalEvents ────────────────────────────────────────────────

export async function getRecentOperationalEvents(
  workspaceId: string | null,
  limit = 20,
): Promise<OperationalEvent[]> {
  let q = getAdmin()
    .from('operational_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (workspaceId) q = q.eq('workspace_id', workspaceId)

  const { data } = await q
  return (data ?? []) as OperationalEvent[]
}

// ── getEventsForEntity ────────────────────────────────────────────────────────

export async function getEventsForEntity(
  entityType: string,
  entityId: string,
  limit = 10,
): Promise<OperationalEvent[]> {
  const { data } = await getAdmin()
    .from('operational_events')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as OperationalEvent[]
}

// ── getEventsForWorkspace ─────────────────────────────────────────────────────

export async function getEventsForWorkspace(
  workspaceId: string,
  options: {
    event_type?:  string
    memory_mode?: MemoryMode
    since?:       string   // ISO timestamp
    limit?:       number
  } = {},
): Promise<OperationalEvent[]> {
  let q = getAdmin()
    .from('operational_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50)

  if (options.event_type)  q = q.eq('event_type', options.event_type)
  if (options.memory_mode) q = q.eq('memory_mode', options.memory_mode)
  if (options.since)       q = q.gte('created_at', options.since)

  const { data } = await q
  return (data ?? []) as OperationalEvent[]
}
