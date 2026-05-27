import { NextRequest, NextResponse }                                      from 'next/server'
import { getExecutionDashboardByPlan, getExecutionDashboardByWallet } from '@/hype/db'
import { fetchHypePrice }                                               from '@/hype/planner'
import { fetchWalletSnapshot }                                          from '@/hype/walletSnapshot'
import { computeReadiness }                                             from '@/hype/readiness'
import type { WalletSnapshot }                                          from '@/hype/walletSnapshot'
import type { WalletReadiness }                                         from '@/hype/readiness'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Fetch snapshot + readiness for a wallet; non-fatal — returns nulls on failure.
async function snapshotAndReadiness(wallet: string): Promise<{
  snap:             WalletSnapshot | null
  wallet_readiness: WalletReadiness | null
}> {
  try {
    const hypePrice      = await fetchHypePrice()
    const snap           = await fetchWalletSnapshot(wallet, hypePrice)
    const wallet_readiness = computeReadiness(snap, hypePrice)
    return { snap, wallet_readiness }
  } catch {
    return { snap: null, wallet_readiness: null }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const planId = searchParams.get('plan_id')?.trim()
  const wallet = searchParams.get('wallet')?.trim()

  try {
    // ── Plan-id path ──────────────────────────────────────────────────────────
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
        const { snap, wallet_readiness } = await snapshotAndReadiness(planWallet)
        const planValid = snap ? dashboard.plan.capital_usd <= snap.available_usd : true

        return NextResponse.json({
          ok: true,
          dashboard: {
            ...dashboard,
            progress: {
              ...dashboard.progress,
              next_action: planValid
                ? dashboard.progress.next_action
                : 'regenerate_plan',
            },
            plan_valid:              planValid,
            validation_warnings:     planValid
              ? []
              : ['Plan capital exceeds current wallet available balance. Regenerate plan.'],
            wallet_snapshot:         snap,
            effective_available_usd: snap?.available_usd ?? null,
            wallet_readiness,
          },
        })
      }

      return NextResponse.json({ ok: true, dashboard })
    }

    // ── Wallet path ───────────────────────────────────────────────────────────
    if (wallet) {
      if (!WALLET_RE.test(wallet)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
          { status: 400 },
        )
      }

      const [dashboard, { snap, wallet_readiness }] = await Promise.all([
        getExecutionDashboardByWallet(wallet),
        snapshotAndReadiness(wallet),
      ])

      if (dashboard.plan && snap) {
        const planValid = dashboard.plan.capital_usd <= snap.available_usd

        return NextResponse.json({
          ok: true,
          dashboard: {
            ...dashboard,
            progress: {
              ...dashboard.progress,
              next_action: planValid
                ? dashboard.progress.next_action
                : 'regenerate_plan',
            },
            plan_valid:              planValid,
            validation_warnings:     planValid
              ? []
              : ['Plan capital exceeds current wallet available balance. Regenerate plan.'],
            wallet_snapshot:         snap,
            effective_available_usd: snap.available_usd,
            wallet_readiness,
          },
        })
      }

      // No plan yet — still return readiness so frontend can gate the funding phase
      return NextResponse.json({
        ok: true,
        dashboard: {
          ...dashboard,
          wallet_snapshot:  snap,
          wallet_readiness,
        },
      })
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
