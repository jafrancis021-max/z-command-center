// Wallet readiness evaluation — determines whether a wallet is eligible for automation
// and what funding action (if any) is required first.
// Pure computation — no network calls, no DB access.

import type { WalletSnapshot } from './walletSnapshot'

// Minimum HYPE needed to make automation worthwhile.
// Gas reserve (min_gas_hype = 0.05) is checked separately — this is the capital threshold.
// Override with MIN_AUTOMATION_HYPE env var (useful for testing with small wallets).
const MIN_AUTOMATION_HYPE = parseFloat(process.env.MIN_AUTOMATION_HYPE ?? '1.0')

export type WalletReadinessStatus =
  | 'wallet_unfunded'       // no assets at all — need to send HYPE to HyperEVM
  | 'wrong_chain'           // reserved: frontend sets this when wallet is on wrong network
  | 'insufficient_hype'     // has some assets but below automation threshold
  | 'ready_for_automation'  // enough HYPE to proceed

export interface WalletReadiness {
  status:                  WalletReadinessStatus
  native_hype:             number   // current native HYPE on HyperEVM
  required_hype:           number   // minimum native HYPE needed to start automation
  available_usd:           number   // total deployable USD (native HYPE + kHYPE)
  required_usd:            number   // USD equivalent of required_hype at snapshot price
  has_convertible_assets:  boolean  // wallet holds USDC/WHYPE that could be swapped to HYPE
  gas_ok:                  boolean
  recommended_action:      RecommendedAction
}

export type RecommendedAction =
  | 'fund_wallet_with_hype'  // send HYPE to this HyperEVM address
  | 'add_more_hype'          // wallet has some HYPE but not enough capital
  | 'add_hype_for_gas'       // has capital (kHYPE) but needs gas
  | 'convert_to_hype'        // has USDC/WHYPE convertible to HYPE
  | 'proceed_to_automation'  // wallet is ready

export function computeReadiness(
  snap:       WalletSnapshot,
  hypePrice:  number,
): WalletReadiness {
  const minHype    = MIN_AUTOMATION_HYPE
  const requiredUsd = Math.round(minHype * hypePrice * 100) / 100

  // Convertible assets: USDC or WHYPE held in wallet (both 0 while contracts unverified,
  // but structure is ready for when they are confirmed)
  const has_convertible_assets = snap.usdc_balance > 0 || snap.whype_balance > 0

  let status:             WalletReadinessStatus
  let recommended_action: RecommendedAction

  if (snap.native_hype < 0.001 && snap.khype_balance < 0.001) {
    // Wallet has essentially no assets on HyperEVM
    status             = 'wallet_unfunded'
    recommended_action = has_convertible_assets ? 'convert_to_hype' : 'fund_wallet_with_hype'
  } else if (!snap.gas_ok && snap.khype_balance > 0) {
    // Has kHYPE but native HYPE too low to pay gas
    status             = 'insufficient_hype'
    recommended_action = 'add_hype_for_gas'
  } else if (!snap.gas_ok) {
    // Has trivial native HYPE but not even enough for gas
    status             = 'insufficient_hype'
    recommended_action = has_convertible_assets ? 'convert_to_hype' : 'add_more_hype'
  } else if (snap.available_usd < requiredUsd) {
    // Gas ok but total capital below automation threshold
    status             = 'insufficient_hype'
    recommended_action = has_convertible_assets ? 'convert_to_hype' : 'add_more_hype'
  } else {
    status             = 'ready_for_automation'
    recommended_action = 'proceed_to_automation'
  }

  return {
    status,
    native_hype:            snap.native_hype,
    required_hype:          minHype,
    available_usd:          snap.available_usd,
    required_usd:           requiredUsd,
    has_convertible_assets,
    gas_ok:                 snap.gas_ok,
    recommended_action,
  }
}
