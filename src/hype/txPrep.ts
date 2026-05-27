// Prepares unsigned EVM transaction requests from approved execution intents.
// Never signs, never broadcasts, never submits transactions.

import { getIntentById } from './db'
import type { IntentRow } from './db'

// ── Verified contract registry ────────────────────────────────────────────────

// Kinetiq kHYPE StakingManager — triple-verified, 2026-05-27
//
// ADDRESS (source: kinetiq.xyz/docs/contracts-and-audits)
//   kHYPE StakingManager: 0x393D0B87Ed38fc779FD9611144aE649BA6082109
//   kHYPE token:          0xfD739d4e423301CE9385c1fb8850539D657C296D
//
// FUNCTION (source 1: github.com/code-423n4/2025-04-kinetiq/src/StakingManager.sol)
//   function stake() public payable nonReentrant whenNotPaused whenStakingNotPaused
//   No parameters. HYPE sent as msg.value. kHYPE minted to msg.sender at live exchange rate.
//   receive() external payable also forwards to stake() but explicit selector is preferred.
//
// SELECTOR (source 2: 4byte.directory — hex_signature=0x3a4b66f1)
//   0x3a4b66f1 → "stake()" — sole registered entry, no collisions.
//
// ON-CHAIN GUARDS (revert conditions the caller must be aware of):
//   whenNotPaused           — global pause; tx reverts if contract is paused
//   whenStakingNotPaused    — staking-specific pause; tx reverts if staking is halted
//   nonReentrant            — standard reentrancy guard
//   min/max thresholds      — on-chain minimum and maximum HYPE per stake call
//   optional whitelist      — if whitelist mode is active, only approved addresses may stake
const KINETIQ_STAKING_MANAGER = '0x393D0B87Ed38fc779FD9611144aE649BA6082109'
const KINETIQ_STAKE_SELECTOR  = '0x3a4b66f1'  // keccak256("stake()")[0:4] — verified via 4byte.directory + audit ABI

// Felix WHYPE branch — verified: Felix docs / HyperEVMScan 2025-05
// TroveNFT + TroveManager confirmed via proof scanner, but these are NOT the tx entry point.
// In Liquity v2 the tx entry point is BorrowerOperations — address unverified in this system.
// WHYPE (wrapped native HYPE) canonical contract address is also unverified.

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxPrepStatus = 'ready' | 'blocked' | 'instruction_only' | 'health_reminder' | 'skipped'

export interface PreparedTransaction {
  intent_id:          string
  protocol:           string
  action:             string
  chain:              string         // 'hyperevm' or 'hyperliquid_l1'
  to:                 string | null  // null for instruction-only / blocked / health_reminder
  value:              string | null  // hex wei; null when no native transfer
  data:               string | null  // hex calldata; null when no calldata
  description:        string
  risk_warning:       string | null
  requires_signature: boolean
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

  // stake() — verified ABI from code-423n4/2025-04-kinetiq (Code4rena audit, April 2025)
  // No parameters. HYPE sent as msg.value. kHYPE minted to msg.sender.
  return {
    intent_id:          intent.id,
    protocol:           intent.protocol,
    action:             intent.action,
    chain:              'hyperevm',
    to:                 KINETIQ_STAKING_MANAGER,
    value:              hypeToWei(hypeAmt),
    data:               KINETIQ_STAKE_SELECTOR,
    description:        `Stake ${hypeAmt.toFixed(4)} HYPE via Kinetiq StakingManager (${KINETIQ_STAKING_MANAGER}) on HyperEVM. ` +
                        `Calls stake() — selector ${KINETIQ_STAKE_SELECTOR}, no parameters. ` +
                        `HYPE sent as transaction value (msg.value). kHYPE minted to your wallet at the current exchange rate. ` +
                        `No prior token approval required.`,
    risk_warning:       'Verify the current kHYPE:HYPE exchange rate before signing — the rate appreciated from 1:1 at launch and changes over time. ' +
                        'kHYPE may trade below HYPE parity in stressed market conditions. ' +
                        'Transaction will revert if: (a) contract is paused (whenNotPaused / whenStakingNotPaused), ' +
                        '(b) HYPE amount is outside the on-chain min/max staking thresholds, or ' +
                        '(c) whitelist mode is active and this wallet has not been approved. ' +
                        'ABI triple-verified: code-423n4/2025-04-kinetiq audit + kinetiq.xyz/docs/contracts-and-audits + 4byte.directory.',
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
  return {
    intent_id:          intent.id,
    protocol:           intent.protocol,
    action:             intent.action,
    chain:              'hyperliquid_l1',
    to:                 null,
    value:              null,
    data:               null,
    description:        'Ongoing Hyperliquid activity reminder: maintain regular perps/spot trading to remain eligible for HYPE S2 season rewards. This is a continuous eligibility behaviour — there is no single transaction to sign. Review the current HYPE S2 criteria and snapshot schedule on the Hyperliquid platform.',
    risk_warning:       null,
    requires_signature: false,
    status:             'health_reminder',
    blocked_reason:     null,
  }
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
