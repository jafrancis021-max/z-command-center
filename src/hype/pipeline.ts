// Transforms an AllocationPlan into DB-ready rows for the execution intent layer.
// No network calls, no DB access — pure transformation.

import type { AllocationPlan, ProtocolAllocation } from './planner'

// ── Status enums ──────────────────────────────────────────────────────────────

export type PlanStatus   = 'planned' | 'approved' | 'executing' | 'completed' | 'cancelled' | 'superseded'
export type IntentStatus = 'planned' | 'awaiting_signature' | 'ready' | 'submitted' | 'confirmed' | 'verified' | 'failed' | 'skipped'
export type StepStatus   = 'planned' | 'awaiting_signature' | 'submitted' | 'confirmed' | 'verified' | 'failed'

// ── DB row shapes (before PK assignment) ──────────────────────────────────────

export interface PlanInsert {
  member_wallet:     string
  capital_usd:       number
  risk_profile:      string
  objective:         string
  hype_price_usd:    number
  hype_equivalent:   number
  allocation_json:   ProtocolAllocation[]
  hedge_required:    boolean
  hedge_reason:      string
  risk_notes:        string[]
  skipped_protocols: { protocol: string; reason: string }[]
  status:            PlanStatus
}

export interface IntentInsert {
  plan_id:            string
  wallet:             string
  protocol:           string
  action:             string
  usd_amount:         number
  hype_amount:        number | null
  requires_signature: boolean
  execution_order:    number
  status:             IntentStatus
  tx_hash:            null
  error_message:      null
}

export interface StepInsert {
  intent_id:          string
  step_number:        number
  title:              string
  description:        string
  protocol:           string
  action:             string
  expected_output:    string | null
  risk_note:          string | null
  requires_signature: boolean
  tx_hash:            null
  status:             StepStatus
}

// Pipeline: plan + parallel intent/step arrays (steps[i] belongs to intents[i])
export interface ExecutionPipeline {
  plan:    PlanInsert
  intents: Omit<IntentInsert, 'plan_id'>[]
  steps:   Omit<StepInsert,  'intent_id'>[]
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

const ACTION_TITLES: Record<string, string> = {
  acquire_hype:                          'Acquire HYPE',
  stake_hype:                            'Stake HYPE (Kinetiq)',
  wrap_hype_to_whype:                    'Wrap HYPE → WHYPE (Felix collateral)',
  open_trove_deposit_whype_borrow_feusd: 'Open Felix Trove — Deposit WHYPE, Borrow feUSD',
  optional_loop_feusd_to_hype:           'Loop feUSD → HYPE [BLOCKED — requires verified DEX]',
  open_hype_short_hedge:                 'Open HYPE Short Hedge (Hyperliquid Perps)',
  maintain_activity_for_hype_s2:         'Maintain Hyperliquid Activity (HYPE S2)',
}

const ACTION_RISK_NOTES: Partial<Record<string, string>> = {
  stake_hype:
    'kHYPE may trade below HYPE parity in stressed markets. Verify the kHYPE:HYPE exchange rate before staking.',
  open_trove_deposit_whype_borrow_feusd:
    'Monitor HYPE price relative to your liquidation threshold after opening. Liquidation is permissionless and immediate.',
  optional_loop_feusd_to_hype:
    'Blocked — HyperSwap is not a verified DEX on HyperEVM. Do not execute until a confirmed swap venue is available.',
  open_hype_short_hedge:
    'This is a hedge, not a directional trade. Size relative to Felix collateral value and adjust as the position changes.',
}

// On-chain actions that require a wallet signature
const SIGNATURE_ACTIONS = new Set([
  'acquire_hype',
  'stake_hype',
  'wrap_hype_to_whype',
  'open_trove_deposit_whype_borrow_feusd',
  'optional_loop_feusd_to_hype',
  'open_hype_short_hedge',
])

// Actions that are blocked at plan time — start as 'skipped'
const BLOCKED_ACTIONS = new Set([
  'optional_loop_feusd_to_hype',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function intentTitle(action: string): string {
  return (
    ACTION_TITLES[action] ??
    action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  )
}

function hypeAmountFor(
  action:       string,
  plan:         AllocationPlan,
  kinetiqAlloc: ProtocolAllocation | undefined,
  felixAlloc:   ProtocolAllocation | undefined,
): number | null {
  switch (action) {
    case 'acquire_hype':                          return plan.hype_equivalent
    case 'stake_hype':                            return kinetiqAlloc?.hype_equivalent ?? null
    case 'wrap_hype_to_whype':
    case 'open_trove_deposit_whype_borrow_feusd': return felixAlloc?.hype_equivalent   ?? null
    default:                                      return null
  }
}

function expectedOutputFor(
  action:       string,
  kinetiqAlloc: ProtocolAllocation | undefined,
  felixAlloc:   ProtocolAllocation | undefined,
): string | null {
  switch (action) {
    case 'stake_hype':                            return kinetiqAlloc?.expected_output ?? null
    case 'open_trove_deposit_whype_borrow_feusd': return felixAlloc?.expected_output   ?? null
    default:                                      return null
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildExecutionPipeline(plan: AllocationPlan): ExecutionPipeline {
  const kinetiqAlloc = plan.allocation_json.find(a => a.protocol === 'kinetiq')
  const felixAlloc   = plan.allocation_json.find(a => a.protocol === 'felix')

  const planInsert: PlanInsert = {
    member_wallet:     plan.wallet,
    capital_usd:       plan.capital_usd,
    risk_profile:      plan.risk_profile,
    objective:         plan.objective,
    hype_price_usd:    plan.hype_price_usd,
    hype_equivalent:   plan.hype_equivalent,
    allocation_json:   plan.allocation_json,
    hedge_required:    plan.hedge_required.required,
    hedge_reason:      plan.hedge_required.reason,
    risk_notes:        plan.risk_notes,
    skipped_protocols: plan.skipped_protocols,
    status:            'planned',
  }

  const intents: Omit<IntentInsert, 'plan_id'>[] = []
  const steps:   Omit<StepInsert,  'intent_id'>[] = []

  for (const execStep of plan.execution_steps) {
    const blocked  = BLOCKED_ACTIONS.has(execStep.action)
    const needsSig = SIGNATURE_ACTIONS.has(execStep.action)

    intents.push({
      wallet:             plan.wallet,
      protocol:           execStep.protocol,
      action:             execStep.action,
      usd_amount:         execStep.amount_usd,
      hype_amount:        hypeAmountFor(execStep.action, plan, kinetiqAlloc, felixAlloc),
      requires_signature: needsSig,
      execution_order:    execStep.step,
      status:             blocked ? 'skipped' : 'planned',
      tx_hash:            null,
      error_message:      null,
    })

    steps.push({
      step_number:        1,
      title:              intentTitle(execStep.action),
      description:        execStep.notes,
      protocol:           execStep.protocol,
      action:             execStep.action,
      expected_output:    expectedOutputFor(execStep.action, kinetiqAlloc, felixAlloc),
      risk_note:          ACTION_RISK_NOTES[execStep.action] ?? null,
      requires_signature: needsSig,
      tx_hash:            null,
      status:             'planned',
    })
  }

  return { plan: planInsert, intents, steps }
}
