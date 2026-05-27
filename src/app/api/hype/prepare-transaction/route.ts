import { NextRequest, NextResponse } from 'next/server'
import { prepareTransaction }        from '@/hype/txPrep'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const intentId = searchParams.get('intent_id')?.trim()

  if (!intentId) {
    return NextResponse.json(
      { ok: false, error: 'Provide intent_id as a query parameter' },
      { status: 400 },
    )
  }

  if (!UUID_RE.test(intentId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid intent_id format (expected UUID)' },
      { status: 400 },
    )
  }

  try {
    const tx_request = await prepareTransaction(intentId)
    return NextResponse.json({ ok: true, tx_request })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/prepare-transaction]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
