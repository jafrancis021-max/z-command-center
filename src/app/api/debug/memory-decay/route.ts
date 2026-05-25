import { NextRequest, NextResponse } from 'next/server'
import { applyDecay } from '@/lib/memory-freshness'

export const dynamic = 'force-dynamic'

// GET  → dry-run preview (no writes)
export async function GET() {
  try {
    const result = await applyDecay({ dryRun: true })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/debug/memory-decay GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}

// POST → apply decay (writes to DB)
export async function POST(req: NextRequest) {
  try {
    const body        = await req.json().catch(() => ({})) as { batch_size?: number }
    const batchSize   = typeof body.batch_size === 'number' ? body.batch_size : 200
    const result      = await applyDecay({ dryRun: false, batchSize })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/debug/memory-decay POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
