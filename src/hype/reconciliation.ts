// Evidence-based state reconciliation for HYPE execution plans.
// Read-only from chain, read-write to DB. No signing. No tx submission.

import {
  getExecutionDashboardByWallet,
  confirmIntentAndSteps,
  insertHypeProof,
  getProofsForWallet,
  type ExecutionDashboard,
} from './db'
import { fetchHypePrice }                         from './planner'
import { fetchWalletSnapshot }                    from './walletSnapshot'
import { computeReadiness, type WalletReadiness } from './readiness'

const TERMINAL_STATUSES = new Set(['confirmed', 'verified', 'failed', 'skipped', 'cancelled'])

export interface ReconciliationChange {
  intent_id:   string
  action:      string
  from_status: string
  to_status:   string
  reason:      string
  proof_type:  string | null
}

export interface ReconciliationResult {
  wallet:           string
  wallet_readiness: WalletReadiness
  checked_intents:  number
  changes:          ReconciliationChange[]
  dashboard:        ExecutionDashboard
}

export async function reconcileHypeExecutionState(wallet: string): Promise<ReconciliationResult> {
  const lower = wallet.toLowerCase()

  const [hypePrice, dashboard] = await Promise.all([
    fetchHypePrice(),
    getExecutionDashboardByWallet(lower),
  ])

  const snap             = await fetchWalletSnapshot(lower, hypePrice)
  const wallet_readiness = computeReadiness(snap, hypePrice)
  const changes:         ReconciliationChange[] = []

  const plan = dashboard.plan
  if (!plan || plan.approval_status !== 'approved') {
    return { wallet: lower, wallet_readiness, checked_intents: 0, changes, dashboard }
  }

  // Build tx_receipt proof index for submitted intents
  const proofRows = await getProofsForWallet(lower)
  const txReceiptProofByIntent = new Map<string, true>()
  for (const proof of proofRows) {
    if (proof.proof_type === 'tx_receipt' && proof.intent_id) {
      txReceiptProofByIntent.set(proof.intent_id, true)
    }
  }

  const activeIntents = dashboard.intents.filter(i => !TERMINAL_STATUSES.has(i.status))
  let checked = 0

  for (const intent of activeIntents) {
    // health_reminder intents have no terminal execution state — never auto-reconcile
    if (intent.intent_type === 'health_reminder') continue
    checked++

    // acquire_hype: manual L1 action — confirm when wallet now holds enough native HYPE
    if (
      intent.action === 'acquire_hype' &&
      (intent.status === 'ready' || intent.status === 'planned') &&
      intent.hype_amount !== null &&
      snap.native_hype >= intent.hype_amount
    ) {
      await confirmIntentAndSteps(intent.id)
      await insertHypeProof({
        wallet:     lower,
        intent_id:  intent.id,
        proof_type: 'balance_check',
        action:     'acquire_hype',
        evidence: {
          native_hype:    snap.native_hype,
          required_hype:  intent.hype_amount,
          hype_price_usd: hypePrice,
        },
      })
      changes.push({
        intent_id:   intent.id,
        action:      'acquire_hype',
        from_status: intent.status,
        to_status:   'confirmed',
        reason:      `Wallet holds ${snap.native_hype} HYPE >= required ${intent.hype_amount} HYPE`,
        proof_type:  'balance_check',
      })
      continue
    }

    // submitted intents: confirm when a tx_receipt proof row exists
    if (intent.status === 'submitted' && txReceiptProofByIntent.has(intent.id)) {
      await confirmIntentAndSteps(intent.id)
      changes.push({
        intent_id:   intent.id,
        action:      intent.action,
        from_status: 'submitted',
        to_status:   'confirmed',
        reason:      'tx_receipt proof row exists in hype_proofs',
        proof_type:  'tx_receipt',
      })
    }
  }

  const finalDashboard = changes.length > 0
    ? await getExecutionDashboardByWallet(lower)
    : dashboard

  return {
    wallet:          lower,
    wallet_readiness,
    checked_intents: checked,
    changes,
    dashboard:       finalDashboard,
  }
}
