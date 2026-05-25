import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import {
  summarizeReplay,
  groupReplayEventsByDay,
  explainReplaySequence,
  type ReplayEvent,
} from '@/lib/operational-replay'

export const dynamic = 'force-dynamic'

const REPLAY_SELECT = [
  'id', 'created_at', 'event_type', 'event_source',
  'entity_type', 'entity_id', 'title', 'description',
  'memory_mode', 'temperature_tier', 'importance_score',
  'metadata', 'workspace_id',
].join(', ')

// GET /api/debug/replay
// Query params:
//   workspace_id  — filter to workspace (defaults to current workspace)
//   entity_type   — filter by entity type
//   entity_id     — filter by entity id (requires entity_type)
//   event_type    — filter by event type
//   limit         — max events (default 50, max 200)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const entityType   = searchParams.get('entity_type')  ?? null
    const entityId     = searchParams.get('entity_id')    ?? null
    const eventType    = searchParams.get('event_type')   ?? null
    const wsParam      = searchParams.get('workspace_id') ?? null

    // Default to current workspace when no entity filter is active
    const workspaceId = wsParam
      ?? (entityType && entityId ? null : await getCurrentWorkspaceId())

    const db = getAdmin()
    let q = db
      .from('operational_events')
      .select(REPLAY_SELECT)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (workspaceId)             q = q.eq('workspace_id', workspaceId)
    if (entityType && entityId)  q = q.eq('entity_type', entityType).eq('entity_id', entityId)
    else if (entityType)         q = q.eq('entity_type', entityType)
    if (eventType)               q = q.eq('event_type', eventType)

    const { data, error } = await q
    if (error) throw error

    const events  = (data ?? []) as unknown as ReplayEvent[]
    const summary = summarizeReplay(events)
    const grouped = groupReplayEventsByDay(events)
    const explanation = explainReplaySequence(events, 10)

    return NextResponse.json({
      checked_at:   new Date().toISOString(),
      workspace_id: workspaceId,
      filters: { entity_type: entityType, entity_id: entityId, event_type: eventType },
      events,
      grouped,
      summary,
      explanation,
    })
  } catch (err) {
    console.error('[api/debug/replay]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
