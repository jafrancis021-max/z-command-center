// POST /api/hype/reconcile  { wallet }
//
// Frontend contract — "Refresh Status" button:
//   const res  = await fetch('/api/hype/reconcile', { method: 'POST', body: JSON.stringify({ wallet }) })
//   const data = await res.json()
//   if (data.ok) setDashboard(data.dashboard)
//
// Returns: { ok, wallet, wallet_readiness, checked_intents, changes, dashboard }
// Idempotent — safe to call on every user-triggered refresh.

import { NextRequest, NextResponse }         from 'next/server'
import { reconcileHypeExecutionState }        from '@/hype/reconciliation'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const { wallet } = (body ?? {}) as Record<string, unknown>

  if (typeof wallet !== 'string' || !WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
      { status: 400 },
    )
  }

  try {
    const result = await reconcileHypeExecutionState(wallet)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/reconcile]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
