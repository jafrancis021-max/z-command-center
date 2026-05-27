import { NextRequest, NextResponse }                  from 'next/server'
import { getPlanWithPipeline, getLatestPlanByWallet,
         persistPlan, markPlanSuperseded,
         getExecutionDashboardByPlan }                 from '@/hype/db'
import { buildAllocationPlan, fetchHypePrice }         from '@/hype/planner'
import { buildExecutionPipeline }                      from '@/hype/pipeline'
import { fetchWalletSnapshot }                         from '@/hype/walletSnapshot'
import { computeReadiness }                            from '@/hype/readiness'
import type { RiskProfile, Objective }                 from '@/hype/planner'
import type { PlanRow }                                from '@/hype/db'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 2% reserve mirrors runAllocationPlan.ts capital-cap behaviour
function effectiveCapital(available_usd: number): number {
  return Math.floor(available_usd * 0.98 * 100) / 100
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const { plan_id, wallet } = (body ?? {}) as Record<string, unknown>

  // wallet is always required
  if (typeof wallet !== 'string' || !WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
      { status: 400 },
    )
  }

  // plan_id is optional — if provided it must be a valid UUID
  const hasPlanId = plan_id !== undefined && plan_id !== null
  if (hasPlanId && (typeof plan_id !== 'string' || !UUID_RE.test(plan_id))) {
    return NextResponse.json(
      { ok: false, error: 'Invalid plan_id (expected UUID or omit entirely)' },
      { status: 400 },
    )
  }

  const normalizedWallet = wallet.toLowerCase()

  try {
    // ── 1. Resolve prior plan (explicit ID → fallback to latest by wallet) ───────
    let oldPlan: PlanRow | null = null

    if (hasPlanId && typeof plan_id === 'string') {
      const { plan } = await getPlanWithPipeline(plan_id)
      if (plan.member_wallet.toLowerCase() !== normalizedWallet) {
        return NextResponse.json(
          { ok: false, error: 'Wallet does not match the plan owner' },
          { status: 403 },
        )
      }
      oldPlan = plan
    } else {
      oldPlan = await getLatestPlanByWallet(normalizedWallet)
    }

    // ── 2. Inherit risk settings from prior plan, or fall back to safe defaults ──
    const risk_profile: RiskProfile = (oldPlan?.risk_profile as RiskProfile) ?? 'conservative'
    const objective:   Objective    = (oldPlan?.objective    as Objective)    ?? 'accumulate_hype'

    // ── 3. Live price ───────────────────────────────────────────────────────────
    const hypePrice = await fetchHypePrice()

    // ── 4. Wallet snapshot — source of truth for deployable capital ─────────────
    const snap = await fetchWalletSnapshot(normalizedWallet, hypePrice)

    // ── 5. Readiness gate — do not create plans for unfunded/insufficient wallets
    const readiness = computeReadiness(snap, hypePrice)
    if (readiness.status !== 'ready_for_automation') {
      return NextResponse.json(
        {
          ok:              false,
          error:           `Wallet not ready for automation: ${readiness.status}`,
          wallet_readiness: readiness,
        },
        { status: 400 },
      )
    }

    const capital = effectiveCapital(snap.available_usd)
    if (capital <= 0) {
      return NextResponse.json(
        {
          ok:    false,
          error: `Effective capital after 2% gas reserve is $${capital.toFixed(2)} — nothing to plan. ` +
                 `Available: $${snap.available_usd.toFixed(2)}.`,
        },
        { status: 400 },
      )
    }

    // ── 6. Build new plan ───────────────────────────────────────────────────────
    // Wallet is ready_for_automation — it already holds enough HYPE, so suppress
    // the acquire_hype step (wallet doesn't need to buy more HYPE before staking).
    const newPlan = await buildAllocationPlan({
      wallet:                normalizedWallet,
      capital_usd:           capital,
      requested_capital_usd: oldPlan?.capital_usd ?? capital,
      risk_profile,
      objective,
      has_sufficient_hype:   true,
    })

    newPlan.risk_notes.push(
      `Wallet snapshot at plan time: native HYPE ${snap.native_hype.toFixed(4)} ($${snap.native_hype_usd.toFixed(2)}), ` +
      `kHYPE ${snap.khype_balance.toFixed(4)} ($${snap.khype_usd.toFixed(2)}), ` +
      `available_usd $${snap.available_usd.toFixed(2)}, ` +
      `effective_capital (2% reserve) $${capital.toFixed(2)}.`,
    )

    // ── 7. Persist new plan + intents + steps ───────────────────────────────────
    const pipeline  = buildExecutionPipeline(newPlan)
    const persisted = await persistPlan(pipeline)
    const newPlanId = persisted.plan_id

    // ── 8. Supersede old plan — only when one existed; skips terminal plans ──────
    if (oldPlan) {
      await markPlanSuperseded(oldPlan.id)
    }

    // ── 9. Return new dashboard ─────────────────────────────────────────────────
    const dashboard = await getExecutionDashboardByPlan(newPlanId)

    return NextResponse.json({
      ok:          true,
      old_plan_id: oldPlan?.id ?? null,
      new_plan_id: newPlanId,
      dashboard,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/regenerate-plan]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
