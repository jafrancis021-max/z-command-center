import { getAdmin } from '@/lib/supabase-server'
import { getProceduralSuggestions } from '@/lib/procedural-reinforcement'

// ── Types ─────────────────────────────────────────────────────────────────────

// Uses explicit nullable fields — the DB rows are nullable even though
// OperationalEvent typing makes them required after Required<>.
export interface ReplayEvent {
  id:               string
  created_at:       string
  event_type:       string
  event_source:     string
  entity_type:      string | null
  entity_id:        string | null
  title:            string
  description:      string | null
  memory_mode:      string
  temperature_tier: string
  importance_score: number
  metadata:         Record<string, unknown>
  workspace_id:     string | null
}

export interface ReplaySummary {
  total_events:      number
  first_event_at:    string | null
  latest_event_at:   string | null
  duration_days:     number | null
  event_type_counts: Record<string, number>
  source_counts:     Record<string, number>
  entity_types:      string[]
}

export interface ReplayDay {
  date:   string   // YYYY-MM-DD
  label:  string   // 'Today' | 'Yesterday' | 'Tue May 20'
  events: ReplayEvent[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REPLAY_SELECT = [
  'id', 'created_at', 'event_type', 'event_source',
  'entity_type', 'entity_id', 'title', 'description',
  'memory_mode', 'temperature_tier', 'importance_score',
  'metadata', 'workspace_id',
].join(', ')

// ── Fetch helpers ─────────────────────────────────────────────────────────────

export async function getWorkspaceReplay(
  workspaceId: string,
  limit = 50,
): Promise<ReplayEvent[]> {
  const { data } = await getAdmin()
    .from('operational_events')
    .select(REPLAY_SELECT)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data ?? []) as unknown as ReplayEvent[]
}

export async function getEntityReplay(
  entityType: string,
  entityId:   string,
  limit = 50,
): Promise<ReplayEvent[]> {
  const { data } = await getAdmin()
    .from('operational_events')
    .select(REPLAY_SELECT)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data ?? []) as unknown as ReplayEvent[]
}

export async function getCaseReplay(caseId: string, limit = 50): Promise<ReplayEvent[]> {
  return getEntityReplay('operational_case', caseId, limit)
}

export async function getWorkflowReplay(workflowId: string, limit = 50): Promise<ReplayEvent[]> {
  return getEntityReplay('workflow', workflowId, limit)
}

// Fetches most-recent N events for optional chat context injection.
// Returns newest-first (DESC) so the chat prompt sees latest activity.
export async function getRecentReplayForChat(
  workspaceId: string | null,
  limit = 5,
): Promise<ReplayEvent[]> {
  let q = getAdmin()
    .from('operational_events')
    .select(REPLAY_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (workspaceId) q = q.eq('workspace_id', workspaceId)

  const { data } = await q
  return (data ?? []) as unknown as ReplayEvent[]
}

// ── summarizeReplay ───────────────────────────────────────────────────────────

export function summarizeReplay(events: ReplayEvent[]): ReplaySummary {
  if (events.length === 0) {
    return {
      total_events: 0, first_event_at: null, latest_event_at: null,
      duration_days: null, event_type_counts: {}, source_counts: {}, entity_types: [],
    }
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const first = sorted[0]
  const last  = sorted[sorted.length - 1]
  const ms    = new Date(last.created_at).getTime() - new Date(first.created_at).getTime()

  const event_type_counts: Record<string, number> = {}
  const source_counts:     Record<string, number> = {}
  const entity_type_set    = new Set<string>()

  for (const ev of events) {
    event_type_counts[ev.event_type] = (event_type_counts[ev.event_type] ?? 0) + 1
    source_counts[ev.event_source]   = (source_counts[ev.event_source]   ?? 0) + 1
    if (ev.entity_type) entity_type_set.add(ev.entity_type)
  }

  return {
    total_events:      events.length,
    first_event_at:    first.created_at,
    latest_event_at:   last.created_at,
    duration_days:     Math.round(ms / 86_400_000 * 10) / 10,
    event_type_counts,
    source_counts,
    entity_types:      Array.from(entity_type_set),
  }
}

// ── groupReplayEventsByDay ────────────────────────────────────────────────────
// Input: any order — output: days newest-first, events within each day ASC.

export function groupReplayEventsByDay(events: ReplayEvent[]): ReplayDay[] {
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const map = new Map<string, ReplayEvent[]>()
  for (const ev of events) {
    const date = ev.created_at.slice(0, 10)
    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push(ev)
  }

  // Sort each day's events ASC, then return days newest-first
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))   // dates newest-first
    .map(([date, dayEvents]) => ({
      date,
      label:  date === today ? 'Today' : date === yesterday ? 'Yesterday' : fmtDate(date),
      events: dayEvents.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    }))
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// ── getPatternAnnotationForReplay ─────────────────────────────────────────────
// Checks if the event sequence matches any known procedural patterns.
// Returns a one-line annotation or null if no match.

export async function getPatternAnnotationForReplay(
  events:      ReplayEvent[],
  workspaceId: string,
): Promise<string | null> {
  if (events.length < 2 || !workspaceId) return null

  const patterns = await getProceduralSuggestions(workspaceId, 20)
  if (patterns.length === 0) return null

  const eventTypes = events.map(e => e.event_type)

  for (const p of patterns) {
    const seq = p.detected_sequence
    // Check if seq appears as a subsequence in eventTypes
    for (let i = 0; i <= eventTypes.length - seq.length; i++) {
      if (seq.every((s, j) => s === eventTypes[i + j])) {
        return `Matches known pattern "${p.pattern_name}" (confidence ${(p.confidence_score * 100).toFixed(0)}%)`
      }
    }
  }

  return null
}

// ── explainReplaySequence ─────────────────────────────────────────────────────
// Returns plain-text lines for system prompt injection or debug display.

export function explainReplaySequence(events: ReplayEvent[], limit = 8): string[] {
  const sorted = [...events]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, limit)

  return sorted.map(ev => {
    const dt = new Date(ev.created_at)
    const d  = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const t  = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    const entityPart = ev.entity_type ? ` [${ev.entity_type}]` : ''
    return `${d} ${t} — ${ev.event_type}${entityPart}: ${ev.title}`
  })
}
