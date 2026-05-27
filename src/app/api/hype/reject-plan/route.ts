import { NextRequest, NextResponse }                              from 'next/server'
import { getLatestPlanByWallet, rejectPlan,
         getExecutionDashboardByPlan }                            from '@/hype/db'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const { plan_id, wallet, reason } = (body ?? {}) as Record<string, unknown>

  if (typeof wallet !== 'string' || !WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
      { status: 400 },
    )
  }

  const hasPlanId = plan_id !== undefined && plan_id !== null
  if (hasPlanId && (typeof plan_id !== 'string' || !UUID_RE.test(plan_id))) {
    return NextResponse.json(
      { ok: false, error: 'Invalid plan_id (expected UUID or omit entirely)' },
      { status: 400 },
    )
  }

  const normalizedWallet  = wallet.toLowerCase()
  const rejectionReason   = typeof reason === 'string' ? reason.trim() : ''

  try {
    // Resolve plan — explicit ID or latest by wallet
    let resolvedPlanId: string

    if (hasPlanId && typeof plan_id === 'string') {
      resolvedPlanId = plan_id
    } else {
      const latest = await getLatestPlanByWallet(normalizedWallet)
      if (!latest) {
        return NextResponse.json(
          { ok: false, error: 'No plan found for this wallet.' },
          { status: 404 },
        )
      }
      resolvedPlanId = latest.id
    }

    await rejectPlan(resolvedPlanId, normalizedWallet, rejectionReason)

    const dashboard = await getExecutionDashboardByPlan(resolvedPlanId)

    return NextResponse.json({ ok: true, plan_id: resolvedPlanId, dashboard })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/reject-plan]', message)
    if (message.includes('Wallet mismatch'))    return NextResponse.json({ ok: false, error: message }, { status: 403 })
    if (message.includes('already') || message.includes('status is'))
                                                return NextResponse.json({ ok: false, error: message }, { status: 409 })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
