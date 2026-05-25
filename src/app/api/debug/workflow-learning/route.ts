import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { getProceduralSuggestions } from '@/lib/procedural-reinforcement'
import {
  getWorkflowLearningLoopSummary,
  recordWorkflowLearningSignal,
  type LearningSignalType,
} from '@/lib/workflow-learning'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const workspaceId = await getCurrentWorkspaceId()
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace' }, { status: 400 })
    }

    const patterns = await getProceduralSuggestions(workspaceId, 20)
    const loop     = await getWorkflowLearningLoopSummary(workspaceId, patterns)

    return NextResponse.json({
      ...loop,
      patterns,
    })
  } catch (err) {
    console.error('[api/debug/workflow-learning GET]', err)
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

    const body = await req.json().catch(() => ({})) as {
      signalType?:     string
      patternId?:      string
      signalStrength?: number
      notes?:          string
    }

    const signalType = (body.signalType ?? 'user_viewed_pattern') as LearningSignalType

    await recordWorkflowLearningSignal({
      workspaceId,
      patternId:      body.patternId      ?? null,
      signalType,
      signalSource:   'user',
      signalStrength: body.signalStrength ?? 1.0,
      notes:          body.notes,
    })

    const patterns = await getProceduralSuggestions(workspaceId, 20)
    const loop     = await getWorkflowLearningLoopSummary(workspaceId, patterns)

    return NextResponse.json({
      recorded: { signalType, workspaceId },
      ...loop,
    })
  } catch (err) {
    console.error('[api/debug/workflow-learning POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
