import { NextRequest, NextResponse }                                      from 'next/server'
import { getExecutionDashboardByPlan, getExecutionDashboardByWallet } from '@/hype/db'
import { fetchHypePrice }                                               from '@/hype/planner'
import { fetchWalletSnapshot }                                          from '@/hype/walletSnapshot'
import type { WalletSnapshot }                                          from '@/hype/walletSnapshot'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// Ethereum address: 0x + 40 hex chars
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

// Relaxed UUID v4 shape check — prevents trivially bad IDs reaching the DB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function validatePlanAgainstWallet(
  planCapitalUsd: number,
  wallet: string,
): Promise<{
  plan_valid:              boolean
  validation_warnings:     string[]
  wallet_snapshot:         WalletSnapshot | null
  effective_available_usd: number | null
}> {
  try {
    const hype_price_usd = await fetchHypePrice()
    const snap           = await fetchWalletSnapshot(wallet, hype_price_usd)
    const plan_valid     = planCapitalUsd <= snap.available_usd

    return {
      plan_valid,
      validation_warnings: plan_valid
        ? []
        : ['Plan capital exceeds current wallet available balance. Regenerate plan.'],
      wallet_snapshot:         snap,
      effective_available_usd: snap.available_usd,
    }
  } catch (err) {
    // Snapshot unavailable — don't block the dashboard, surface as a warning
    return {
      plan_valid:              true,
      validation_warnings:     [`Wallet snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`],
      wallet_snapshot:         null,
      effective_available_usd: null,
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const planId = searchParams.get('plan_id')?.trim()
  const wallet = searchParams.get('wallet')?.trim()

  try {
    if (planId) {
      if (!UUID_RE.test(planId)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid plan_id format (expected UUID)' },
          { status: 400 },
        )
      }
      const dashboard  = await getExecutionDashboardByPlan(planId)
      const planWallet = dashboard.plan?.member_wallet

      if (dashboard.plan && planWallet) {
        const validation = await validatePlanAgainstWallet(dashboard.plan.capital_usd, planWallet)
        return NextResponse.json({
          ok: true,
          dashboard: {
            ...dashboard,
            progress: {
              ...dashboard.progress,
              next_action: validation.plan_valid
                ? dashboard.progress.next_action
                : 'regenerate_plan',
            },
            ...validation,
          },
        })
      }

      return NextResponse.json({ ok: true, dashboard })
    }

    if (wallet) {
      if (!WALLET_RE.test(wallet)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
          { status: 400 },
        )
      }
      const dashboard = await getExecutionDashboardByWallet(wallet)

      if (dashboard.plan) {
        const validation = await validatePlanAgainstWallet(dashboard.plan.capital_usd, wallet)
        return NextResponse.json({
          ok: true,
          dashboard: {
            ...dashboard,
            progress: {
              ...dashboard.progress,
              next_action: validation.plan_valid
                ? dashboard.progress.next_action
                : 'regenerate_plan',
            },
            ...validation,
          },
        })
      }

      return NextResponse.json({ ok: true, dashboard })
    }

    return NextResponse.json(
      { ok: false, error: 'Provide either wallet or plan_id as a query parameter' },
      { status: 400 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/execution-dashboard]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
