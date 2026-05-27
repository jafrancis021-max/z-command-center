import { NextRequest, NextResponse }    from 'next/server'
import { submitIntentTx }              from '@/hype/db'
import { reconcileHypeExecutionState } from '@/hype/reconciliation'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WALLET_RE  = /^0x[0-9a-fA-F]{40}$/
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  const intentId = typeof b.intent_id === 'string' ? b.intent_id.trim() : null
  const wallet   = typeof b.wallet   === 'string' ? b.wallet.trim()   : null
  const txHash   = typeof b.tx_hash  === 'string' ? b.tx_hash.trim()  : null
  const chainId  = typeof b.chain_id === 'string' ? b.chain_id.trim() : null

  const errs: string[] = []
  if (!intentId)                   errs.push('intent_id is required')
  else if (!UUID_RE.test(intentId)) errs.push('intent_id must be a valid UUID')

  if (!wallet)                     errs.push('wallet is required')
  else if (!WALLET_RE.test(wallet)) errs.push('wallet must be a valid Ethereum address (0x + 40 hex chars)')

  if (!txHash)                      errs.push('tx_hash is required')
  else if (!TX_HASH_RE.test(txHash)) errs.push('tx_hash must be 0x + 64 hex chars')

  if (!chainId) errs.push('chain_id is required')

  if (errs.length > 0) {
    return NextResponse.json({ ok: false, errors: errs }, { status: 400 })
  }

  try {
    const intent = await submitIntentTx(intentId!, wallet!, txHash!, chainId!)

    // Best-effort reconciliation after submit — non-fatal if RPC or DB is unavailable.
    // Gives the frontend an up-to-date dashboard without a second round-trip.
    let reconciliation: Awaited<ReturnType<typeof reconcileHypeExecutionState>> | null = null
    try {
      reconciliation = await reconcileHypeExecutionState(wallet!)
    } catch (reconcileErr) {
      console.warn('[api/hype/submit-transaction] post-submit reconcile failed (non-fatal):',
        reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr))
    }

    return NextResponse.json({ ok: true, intent, reconciliation })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/hype/submit-transaction]', message)

    // Distinguish client errors (wallet mismatch, wrong status) from server errors
    const isClientErr =
      message.includes('Wallet mismatch') ||
      message.includes('Intent status is') ||
      message.includes('Invalid tx_hash') ||
      message.includes('Intent not found')

    return NextResponse.json({ ok: false, error: message }, { status: isClientErr ? 400 : 500 })
  }
}
