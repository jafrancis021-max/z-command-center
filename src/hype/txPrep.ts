// Prepares unsigned EVM transaction requests from approved execution intents.
// Never signs, never broadcasts, never submits transactions.

import { getIntentById } from './db'
import type { IntentRow } from './db'

// ── Verified contract registry ────────────────────────────────────────────────

// Kinetiq StakingManager — verified: kinetiq.xyz/docs/contracts-and-audits
const KINETIQ_STAKING_MANAGER = '0x393D0B87Ed38fc779FD9611144aE649BA6082109'

// Felix WHYPE branch — verified: Felix docs / HyperEVMScan 2025-05
// TroveNFT + TroveManager confirmed via proof scanner, but these are NOT the tx entry point.
// In Liquity v2 the tx entry point is BorrowerOperations — address unverified in this system.
// WHYPE (wrapped native HYPE) canonical contract address is also unverified.

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxPrepStatus = 'ready' | 'blocked' | 'instruction_only' | 'skipped'

export interface PreparedTransaction {
  intent_id:          string
  protocol:           string
  action:             string
  chain:              string         // 'hyperevm' or 'hyperliquid_l1'
  to:                 string | null  // null for instruction-only / blocked
  value:              string | null  // hex wei; null when no native transfer
  data:               string | null  // hex calldata; null when no calldata
  description:        string
  risk_warning:       string | null
  requires_signature: true
  status:             TxPrepStatus
  blocked_reason:     string | null  // populated when status === 'blocked'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function protocolChain(protocol: string): string {
  return protocol === 'hyperliquid' ? 'hyperliquid_l1' : 'hyperevm'
}

// Convert HYPE float to hex wei string (18 decimals).
// Split into two 9-digit multiplications to keep values inside JS safe-integer range.
function hypeToWei(hype: number): string {
  const gwei = BigInt(Math.round(hype * 1000000000))
  return '0x' + (gwei * BigInt(1000000000)).toString(16)
}

function makeBlocked(
  intent:       IntentRow,
  reason:       string,
  risk_warning: string | null = null,
): PreparedTransaction {
  return {
    intent_id:          intent.id,
    protocol:           intent.protocol,
    action:             intent.action,
    chain:              protocolChain(intent.protocol),
    to:                 null,
    value:              null,
    data:               null,
    description:        reason,
    risk_warning,
    requires_signature: true,
    status:             'blocked',
    blocked_reason:     reason,
  }
}

function makeInstructionOnly(
  intent:       IntentRow,
  chain:        string,
  description:  string,
  risk_warning: string | null = null,
): PreparedTransaction {
  return {
    intent_id:          intent.id,
    protocol:           intent.protocol,
    action:             intent.action,
    chain,
    to:                 null,
    value:              null,
    data:               null,
    description,
    risk_warning,
    requires_signature: true,
    status:             'instruction_only',
    blocked_reason:     null,
  }
}

// ── Action preparers ──────────────────────────────────────────────────────────

function prepareAcquireHype(intent: IntentRow): PreparedTransaction {
  const amt = intent.hype_amount?.toFixed(4) ?? '?'
  return makeInstructionOnly(
    intent,
    'hyperliquid_l1',
    `Buy ~${amt} HYPE on the Hyperliquid spot market, or transfer existing HYPE to your HyperEVM wallet address. This is a Hyperliquid L1 action — no EVM transaction is involved.`,
    'Verify the live HYPE price before executing. The price used during plan generation may no longer be accurate.',
  )
}

function prepareKinetiqStakeHype(intent: IntentRow): PreparedTransaction {
  const hypeAmt = intent.hype_amount ?? 0
  if (hypeAmt <= 0) {
    return makeBlocked(
      intent,
      'hype_amount is zero or missing on this intent — cannot encode stake transaction value.',
    )
  }

  // deposit() payable — assumed from common liquid staking pattern (WETH-style receipt).
  // keccak256("deposit()")[0..3] = 0xd0e30db0
  // Native HYPE is sent as tx value; no token approval required.
  return {
    intent_id:          intent.id,
    protocol:           intent.protocol,
    action:             intent.action,
    chain:              'hyperevm',
    to:                 KINETIQ_STAKING_MANAGER,
    value:              hypeToWei(hypeAmt),
    data:               '0xd0e30db0',
    description:        `Stake ${hypeAmt.toFixed(4)} HYPE via Kinetiq StakingManager (${KINETIQ_STAKING_MANAGER}) on HyperEVM. Send HYPE as transaction value. Receive kHYPE as the liquid staking receipt token. No prior token approval is required.`,
    risk_warning:
      'VERIFY ABI BEFORE SIGNING: function selector 0xd0e30db0 (deposit()) is assumed from the common liquid staking pattern. Confirm the exact StakingManager function signature from the official Kinetiq ABI at kinetiq.xyz/docs/contracts-and-audits before signing. kHYPE may trade below HYPE parity in stressed market conditions.',
    requires_signature: true,
    status:             'ready',
    blocked_reason:     null,
  }
}

function prepareFelixWrapHype(intent: IntentRow): PreparedTransaction {
  return makeBlocked(
    intent,
    'WHYPE contract address not verified. The canonical wrapped-HYPE (WHYPE) contract on HyperEVM has not been confirmed in this system. Confirm the WHYPE contract address via the Felix UI (usefelix.xyz) or official Felix documentation before executing this step.',
    'Do not wrap HYPE via an unverified contract — funds sent to the wrong address are unrecoverable. Confirm the contract address from the official Felix UI or documentation.',
  )
}

function prepareFelixOpenTrove(intent: IntentRow): PreparedTransaction {
  return makeBlocked(
    intent,
    'Felix BorrowerOperations address not verified for the WHYPE branch. In Liquity v2, openTrove is called on BorrowerOperations (not TroveManager). The BorrowerOperations address for the Felix WHYPE branch has not been confirmed in this system. Verify via Felix documentation or HyperEVMScan before executing.',
    'Opening a trove against an incorrect BorrowerOperations address will cause the transaction to fail or result in loss of funds. Verify the complete Felix contract set (BorrowerOperations, TroveManager, TroveNFT) from the official Felix documentation before signing any trove transaction.',
  )
}

function prepareOptionalLoop(_intent: IntentRow): PreparedTransaction {
  // Permanently blocked — HyperSwap unverified
  return makeBlocked(
    _intent,
    'optional_loop_feusd_to_hype is permanently blocked. HyperSwap is not a verified DEX on HyperEVM. Do not route feUSD → HYPE swaps through unverified contracts.',
    'Routing funds through an unverified swap contract may result in total loss. This step will remain blocked until a verified HyperEVM DEX is available.',
  )
}

function prepareHyperliquidHedge(intent: IntentRow): PreparedTransaction {
  return makeInstructionOnly(
    intent,
    'hyperliquid_l1',
    `Open a HYPE-PERP short position on Hyperliquid for ~$${intent.usd_amount.toFixed(2)} notional. Use the Hyperliquid trading UI or API to place the short. This is a Hyperliquid L1 action — no EVM transaction is involved. Size this hedge relative to your open Felix WHYPE collateral value.`,
    'This is a hedge position, not a directional trade. Size it based on your Felix trove collateral value and adjust as the collateral value changes. Maintaining a Hyperliquid perp position requires margin — monitor for liquidation on the perp side as well.',
  )
}

function prepareMaintainActivity(intent: IntentRow): PreparedTransaction {
  return makeInstructionOnly(
    intent,
    'hyperliquid_l1',
    'Maintain regular trading activity on Hyperliquid (perps and/or spot) to remain eligible for HYPE S2 season rewards. This is an ongoing activity requirement on Hyperliquid L1 — there is no single EVM transaction. Review the current HYPE S2 eligibility criteria and snapshot schedule on the Hyperliquid platform.',
    null,
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function prepareTransaction(intentId: string): Promise<PreparedTransaction> {
  const intent = await getIntentById(intentId)

  // Skipped intents are not prepared
  if (intent.status === 'skipped') {
    return {
      intent_id:          intent.id,
      protocol:           intent.protocol,
      action:             intent.action,
      chain:              protocolChain(intent.protocol),
      to:                 null,
      value:              null,
      data:               null,
      description:        `Intent '${intent.action}' is skipped and will not be executed.`,
      risk_warning:       null,
      requires_signature: true,
      status:             'skipped',
      blocked_reason:     'Intent status is skipped',
    }
  }

  // Only approved intents can be prepared for signing
  if (intent.approval_status !== 'approved') {
    return makeBlocked(
      intent,
      `Intent approval_status is '${intent.approval_status}' — only intents with approval_status='approved' can be prepared for signing. Approve the parent plan first.`,
    )
  }

  switch (intent.action) {
    case 'acquire_hype':
      return prepareAcquireHype(intent)
    case 'stake_hype':
      return prepareKinetiqStakeHype(intent)
    case 'wrap_hype_to_whype':
      return prepareFelixWrapHype(intent)
    case 'open_trove_deposit_whype_borrow_feusd':
      return prepareFelixOpenTrove(intent)
    case 'optional_loop_feusd_to_hype':
      return prepareOptionalLoop(intent)
    case 'open_hype_short_hedge':
      return prepareHyperliquidHedge(intent)
    case 'maintain_activity_for_hype_s2':
      return prepareMaintainActivity(intent)
    default:
      return makeBlocked(
        intent,
        `Unknown action '${intent.action}' — no transaction preparation is available for this action.`,
      )
  }
}
