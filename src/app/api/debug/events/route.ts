import { NextRequest, NextResponse } from 'next/server'
import { getRecentOperationalEvents, getEventsForEntity, getEventsForWorkspace } from '@/lib/operational-events'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

// GET /api/debug/events
// Query params:
//   limit       — max events to return (default 20)
//   event_type  — filter by event type
//   entity_type — filter by entity type
//   entity_id   — filter by entity id (requires entity_type)
//   since       — ISO timestamp lower bound
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
  const eventType   = searchParams.get('event_type')  ?? undefined
  const entityType  = searchParams.get('entity_type') ?? undefined
  const entityId    = searchParams.get('entity_id')   ?? undefined
  const since       = searchParams.get('since')       ?? undefined

  const workspaceId = await getCurrentWorkspaceId()

  let events

  if (entityType && entityId) {
    events = await getEventsForEntity(entityType, entityId, limit)
  } else if (workspaceId) {
    events = await getEventsForWorkspace(workspaceId, { event_type: eventType, since, limit })
  } else {
    events = await getRecentOperationalEvents(null, limit)
  }

  // Aggregate by event_type for quick summary
  const typeCounts: Record<string, number> = {}
  for (const e of events) {
    typeCounts[e.event_type] = (typeCounts[e.event_type] ?? 0) + 1
  }

  return NextResponse.json({
    workspace_id:   workspaceId,
    total:          events.length,
    event_types:    typeCounts,
    events,
  })
}
