import { NextRequest, NextResponse } from 'next/server'
import { fetchWalletSnapshot }       from '@/hype/walletSnapshot'
import { fetchHypePrice }            from '@/hype/planner'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.trim()

  if (!wallet) {
    return NextResponse.json(
      { ok: false, error: 'Provide wallet as a query parameter' },
      { status: 400 },
    )
  }

  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid wallet format (expected 0x + 40 hex chars)' },
      { status: 400 },
    )
  }

  try {
    const hype_price_usd = await fetchHypePrice()
    const snap           = await fetchWalletSnapshot(wallet, hype_price_usd)

    return NextResponse.json({
      wallet:        snap.wallet,
      snapshot_time: new Date().toISOString(),
      hype_price_usd,
      native_hype:   snap.native_hype,
      khype:         snap.khype_balance,
      available_usd: snap.available_usd,
      min_gas_hype:  snap.min_gas_hype,
      gas_ok:        snap.gas_ok,
      assets: [
        {
          symbol:    'HYPE',
          balance:   snap.native_hype,
          usd_value: snap.native_hype_usd,
          counted:   true,
        },
        {
          symbol:    'kHYPE',
          balance:   snap.khype_balance,
          usd_value: snap.khype_usd,
          counted:   true,
        },
        {
          symbol:    'USDC',
          balance:   null,
          usd_value: null,
          counted:   false,
          reason:    'contract unverified',
        },
        {
          symbol:    'WHYPE',
          balance:   null,
          usd_value: null,
          counted:   false,
          reason:    'contract unverified',
        },
      ],
      warnings: snap.warnings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/wallet-snapshot]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
