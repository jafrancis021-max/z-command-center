import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { getRuntimeState, suggestedBehaviorForWarnings } from '@/lib/runtime-state'
import { createOperationalEvent } from '@/lib/operational-events'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [state, workspaceId] = await Promise.all([
      getRuntimeState(),
      getCurrentWorkspaceId(),
    ])

    const suggestedBehavior = suggestedBehaviorForWarnings(state.warnings)

    // Emit runtime.warning_detected for any new warnings (fire-and-forget)
    if (state.warnings.length > 0) {
      const hasSevere   = state.warnings.some(w => w.level === 'severe')
      const eventTitle  = hasSevere
        ? `Runtime critical — ${state.warnings.length} severe warning(s) detected`
        : `Runtime degraded — ${state.warnings.length} warning(s) detected`

      after(() => createOperationalEvent({
        workspace_id:     workspaceId,
        event_type:       'runtime.warning_detected',
        event_source:     'system',
        entity_type:      'runtime',
        entity_id:        'workspace',
        title:            eventTitle,
        description:      state.warnings.map(w => w.message).join(' · '),
        metadata:         {
          overall_status: state.overall_status,
          warning_count:  state.warnings.length,
          sources:        state.warnings.map(w => w.source),
        },
        importance_score: hasSevere ? 0.85 : 0.55,
        memory_mode:      'runtime',
        temperature_tier: hasSevere ? 'hot' : 'warm',
      }))
    }

    return NextResponse.json({
      status:              state.overall_status,
      warnings:            state.warnings,
      sources:             state.sources,
      checked_at:          state.checked_at,
      suggested_behavior:  suggestedBehavior,
    })
  } catch (err) {
    console.error('[api/debug/runtime]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}
