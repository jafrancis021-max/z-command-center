import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { detectWorkflowPatterns, getProceduralSuggestions } from '@/lib/procedural-reinforcement'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const workspaceId = await getCurrentWorkspaceId()
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace' }, { status: 400 })
    }

    const patterns = await getProceduralSuggestions(workspaceId)

    return NextResponse.json({
      patterns,
      count: patterns.length,
      workspaceId,
    })
  } catch (err) {
    console.error('[api/debug/procedural-patterns GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getCurrentWorkspaceId()
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({})) as { windowSize?: number; eventLimit?: number }
    const windowSize  = body.windowSize  ?? 3
    const eventLimit  = body.eventLimit  ?? 200

    const detected = await detectWorkflowPatterns(workspaceId, windowSize, eventLimit)

    return NextResponse.json({
      detected,
      count:       detected.length,
      workspaceId,
      windowSize,
      eventLimit,
    })
  } catch (err) {
    console.error('[api/debug/procedural-patterns POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
