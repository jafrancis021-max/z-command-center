import { NextRequest, NextResponse } from 'next/server'
import { getRecentRetrievalTelemetry, summarizeFromEvents } from '@/lib/retrieval-telemetry'

export const dynamic = 'force-dynamic'

// GET /api/debug/retrieval-telemetry?limit=<n>
// Returns recent retrieval telemetry events + aggregate summary.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

    const events  = await getRecentRetrievalTelemetry(limit)
    const summary = summarizeFromEvents(events)

    // Shape each event for the response — keep metadata accessible
    const recent = events.slice(0, 20).map(ev => {
      const meta = (ev.metadata ?? {}) as Record<string, unknown>
      return {
        id:          ev.id,
        created_at:  ev.created_at,
        title:       ev.title,
        intent:      meta.intent              ?? 'unknown',
        item_count:  meta.item_count          ?? 0,
        workspace_scoped_count: meta.workspace_scoped_count ?? 0,
        global_fallback_count:  meta.global_fallback_count  ?? 0,
        speculative_blocked:    meta.speculative_blocked     ?? false,
        top_memory_score:       meta.top_memory_score        ?? 0,
        selected_modes:         meta.selected_modes          ?? [],
        user_message_preview:   meta.user_message_preview    ?? '',
        temperature_dist:       meta.temperature_dist        ?? {},
      }
    })

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      total:      summary.total_retrievals,
      summary,
      recent,
    })
  } catch (err) {
    console.error('[api/debug/retrieval-telemetry]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
