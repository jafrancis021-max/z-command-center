import { hlApiUrl } from './hl'

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'
export type Objective   = 'accumulate_hype' | 'generate_yield' | 'leverage' | 'diversify'

export interface AllocationInput {
  wallet:                  string
  capital_usd:             number   // effective capital — what the plan will actually use
  requested_capital_usd?:  number   // original request before any cap; defaults to capital_usd
  risk_profile:            RiskProfile
  objective:               Objective
  // When true the wallet already holds enough HYPE — skip the acquire_hype execution step.
  has_sufficient_hype?:    boolean
}

export interface ProtocolAllocation {
  protocol:        string
  action:          string
  usd_amount:      number
  hype_equivalent: number
  pct_of_capital:  number
  expected_output: string
  status:          'active' | 'paused' | 'skipped'
}

export interface ExecutionStep {
  step:       number
  protocol:   string
  action:     string
  amount_usd: number
  notes:      string
}

export interface HedgeRequirement {
  required:          boolean
  reason:            string
  suggested_hedge?:  string
}

export interface SkippedProtocol {
  protocol: string
  reason:   string
}

export interface AllocationPlan {
  wallet:                  string
  requested_capital_usd:   number   // what was originally requested
  capital_usd:             number   // effective capital used for all calculations
  hype_price_usd:          number
  hype_equivalent:         number
  risk_profile:            RiskProfile
  objective:               Objective
  allocation_json:         ProtocolAllocation[]
  execution_steps:         ExecutionStep[]
  hedge_required:          HedgeRequirement
  risk_notes:              string[]
  skipped_protocols:       SkippedProtocol[]
  generated_at:            string
}

// ── Allocation weights: [kinetiq_frac, felix_frac] ──────────────────────────
// Hyperliquid/HYPE S2 is the activity + hedge layer — not a capital allocation target.
// HyperLend is PAUSED. HyperSwap is BLOCKED. Neither appears in allocations.
const WEIGHTS: Record<Objective, Record<RiskProfile, [number, number]>> = {
  accumulate_hype: {
    conservative: [1.00, 0.00],
    moderate:     [0.70, 0.30],
    aggressive:   [0.50, 0.50],
  },
  generate_yield: {
    conservative: [1.00, 0.00],
    moderate:     [0.70, 0.30],
    aggressive:   [0.50, 0.50],
  },
  leverage: {
    conservative: [0.60, 0.40],
    moderate:     [0.35, 0.65],
    aggressive:   [0.20, 0.80],
  },
  diversify: {
    conservative: [0.80, 0.20],
    moderate:     [0.60, 0.40],
    aggressive:   [0.45, 0.55],
  },
}

// Felix recommended max LTV by risk profile.
// Felix WHYPE branch liquidation threshold is ~85% LTV (Liquity v2 typical).
const FELIX_LTV: Record<RiskProfile, number> = {
  conservative: 0.50,
  moderate:     0.60,
  aggressive:   0.70,
}
const FELIX_LIQ_THRESHOLD = 0.85

// Fraction of Felix collateral to short on HL perps as a hedge
const HEDGE_FRACTION: Record<RiskProfile, number> = {
  conservative: 0.30,
  moderate:     0.50,
  aggressive:   0.60,
}

// ── Price fetch ───────────────────────────────────────────────────────────────

export async function fetchHypePrice(): Promise<number> {
  // Env override — useful for offline testing or when the API is unavailable.
  const override = parseFloat(process.env.HYPE_PRICE_USD ?? '')
  if (Number.isFinite(override) && override > 0) return override

  const res = await fetch(`${hlApiUrl()}/info`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'allMids' }),
  })
  if (!res.ok) throw new Error(`HL allMids → HTTP ${res.status}`)
  const mids = await res.json() as Record<string, string>
  const price = parseFloat(mids['HYPE'] ?? '0')
  if (!price || !Number.isFinite(price)) {
    throw new Error(
      'HYPE price not found in allMids response. Set HYPE_PRICE_USD env var to override.',
    )
  }
  return price
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number  { return Math.round(n * 100) / 100 }
function round4(n: number): number  { return Math.round(n * 10000) / 10000 }
function pct(f: number): number     { return Math.round(f * 100) }

// ── Plan builder ──────────────────────────────────────────────────────────────

export async function buildAllocationPlan(input: AllocationInput): Promise<AllocationPlan> {
  const { wallet, capital_usd, risk_profile, objective } = input
  const requested_capital_usd = input.requested_capital_usd ?? capital_usd

  const hype_price_usd  = await fetchHypePrice()
  const hype_equivalent = capital_usd / hype_price_usd

  const [kinetiqFrac, felixFrac] = WEIGHTS[objective][risk_profile]
  const kinetiqUsd = capital_usd * kinetiqFrac
  const felixUsd   = capital_usd * felixFrac
  const ltv        = FELIX_LTV[risk_profile]
  const hedgeFrac  = HEDGE_FRACTION[risk_profile]

  // Drop % from entry before approaching liquidation at the chosen LTV
  const dropTolerance = Math.round(((FELIX_LIQ_THRESHOLD - ltv) / FELIX_LIQ_THRESHOLD) * 1000) / 10

  // ── allocation_json ─────────────────────────────────────────────────────────
  const allocation_json: ProtocolAllocation[] = []

  if (kinetiqUsd > 0) {
    const hypeAmt = kinetiqUsd / hype_price_usd
    allocation_json.push({
      protocol:        'kinetiq',
      action:          'stake_hype',
      usd_amount:      round2(kinetiqUsd),
      hype_equivalent: round4(hypeAmt),
      pct_of_capital:  pct(kinetiqFrac),
      expected_output: `~${hypeAmt.toFixed(4)} kHYPE — liquid staking receipt, kHYPE:HYPE ratio appreciates with staking rewards`,
      status:          'active',
    })
  }

  if (felixUsd > 0) {
    const hypeCollateral = felixUsd / hype_price_usd
    const feUsdBorrow    = felixUsd * ltv
    const hypeFromLoop   = feUsdBorrow / hype_price_usd

    allocation_json.push({
      protocol:        'felix',
      action:          'open_trove_whype',
      usd_amount:      round2(felixUsd),
      hype_equivalent: round4(hypeCollateral),
      pct_of_capital:  pct(felixFrac),
      expected_output: `~$${feUsdBorrow.toFixed(2)} feUSD at ${pct(ltv)}% LTV — borrow to acquire ~${hypeFromLoop.toFixed(4)} HYPE; ${dropTolerance}% HYPE price drop tolerance before liquidation zone`,
      status:          'active',
    })
  }

  // ── execution_steps ─────────────────────────────────────────────────────────
  const execution_steps: ExecutionStep[] = []
  let step = 1

  // Omit acquire_hype when wallet already holds sufficient HYPE for this plan.
  if (!input.has_sufficient_hype) {
    execution_steps.push({
      step:       step++,
      protocol:   'hyperliquid',
      action:     'acquire_hype',
      amount_usd: capital_usd,
      notes: [
        `Buy ~${hype_equivalent.toFixed(4)} HYPE on Hyperliquid spot at ~$${hype_price_usd.toFixed(2)},`,
        'or transfer existing HYPE balance to your HyperEVM wallet.',
        'Price used for planning only — verify live rate before executing.',
      ].join(' '),
    })
  }

  if (kinetiqUsd > 0) {
    const hypeAmt = kinetiqUsd / hype_price_usd
    execution_steps.push({
      step:       step++,
      protocol:   'kinetiq',
      action:     'stake_hype',
      amount_usd: round2(kinetiqUsd),
      notes: [
        `Stake ~${hypeAmt.toFixed(4)} HYPE via Kinetiq StakingManager`,
        '(0x393D0B87Ed38fc779FD9611144aE649BA6082109).',
        'Receive kHYPE (0xfD739d4e423301CE9385c1fb8850539D657C296D).',
        'Verify the current kHYPE:HYPE exchange rate before executing —',
        'rate starts at 1:1 and increases with accumulated staking rewards.',
      ].join(' '),
    })
  }

  if (felixUsd > 0) {
    const hypeCollateral = felixUsd / hype_price_usd
    const feUsdBorrow    = felixUsd * ltv

    execution_steps.push({
      step:       step++,
      protocol:   'felix',
      action:     'wrap_hype_to_whype',
      amount_usd: round2(felixUsd),
      notes: [
        `Wrap ~${hypeCollateral.toFixed(4)} HYPE → WHYPE (ERC-20 wrapped HYPE).`,
        'WHYPE is required as collateral for the Felix WHYPE branch.',
        'Confirm the canonical WHYPE contract address and wrapping method via Felix UI',
        'or official docs before executing.',
      ].join(' '),
    })

    execution_steps.push({
      step:       step++,
      protocol:   'felix',
      action:     'open_trove_deposit_whype_borrow_feusd',
      amount_usd: round2(felixUsd),
      notes: [
        `Open trove on Felix WHYPE branch.`,
        `Deposit ~${hypeCollateral.toFixed(4)} WHYPE as collateral.`,
        `Borrow ~$${feUsdBorrow.toFixed(2)} feUSD at ${pct(ltv)}% LTV.`,
        `TroveNFT: 0x5ad1512e7006fdbd0f3ebb8aa35c5e9234a03aa7 |`,
        `TroveManager: 0x3100f4e7bda2ed2452d9a57eb30260ab071bbe62.`,
        `Set a price alert: HYPE dropping ${dropTolerance}% from current price approaches your liquidation zone.`,
      ].join(' '),
    })

    execution_steps.push({
      step:       step++,
      protocol:   'felix',
      action:     'optional_loop_feusd_to_hype',
      amount_usd: round2(feUsdBorrow),
      notes: [
        `OPTIONAL LOOP: Swap ~$${feUsdBorrow.toFixed(2)} feUSD → HYPE to compound HYPE exposure,`,
        'then stake the acquired HYPE in Kinetiq.',
        'A verified HyperEVM DEX is required for this step.',
        'HyperSwap is currently unverified — do not execute until a confirmed swap venue is available.',
      ].join(' '),
    })
  }

  if (felixUsd > 0) {
    const hedgeNotional = felixUsd * hedgeFrac
    execution_steps.push({
      step:       step++,
      protocol:   'hyperliquid',
      action:     'open_hype_short_hedge',
      amount_usd: round2(hedgeNotional),
      notes: [
        `Open HYPE-PERP short on Hyperliquid for ~$${hedgeNotional.toFixed(2)} notional`,
        `(${pct(hedgeFrac)}% of $${felixUsd.toFixed(2)} Felix collateral value).`,
        'This hedges Felix downside exposure — it is a risk management position, not a directional trade.',
        'Adjust size based on your net delta target.',
      ].join(' '),
    })
  }

  execution_steps.push({
    step:       step,
    protocol:   'hyperliquid',
    action:     'maintain_activity_for_hype_s2',
    amount_usd: 0,
    notes: [
      'Maintain regular perps/spot trading activity on Hyperliquid for HYPE S2 season eligibility.',
      'This is the activity layer — separate from capital allocation, no specific capital lock required.',
      'Review current HYPE S2 eligibility criteria and snapshot schedule before each season.',
    ].join(' '),
  })

  // ── hedge_required ──────────────────────────────────────────────────────────
  let hedge_required: HedgeRequirement
  if (felixUsd > 0) {
    const hedgeNotional = felixUsd * hedgeFrac
    hedge_required = {
      required: true,
      reason: [
        `Felix trove targets ${pct(ltv)}% LTV on WHYPE collateral.`,
        `A HYPE price drawdown of more than ~${dropTolerance}% from entry approaches the liquidation zone`,
        `(${pct(ltv)}% target vs ~${pct(FELIX_LIQ_THRESHOLD)}% liquidation threshold).`,
        'A partial short hedge reduces net directional exposure and extends the drawdown buffer.',
      ].join(' '),
      suggested_hedge: `Short ~$${hedgeNotional.toFixed(2)} HYPE-PERP on Hyperliquid (${pct(hedgeFrac)}% of $${felixUsd.toFixed(2)} Felix collateral).`,
    }
  } else {
    hedge_required = {
      required: false,
      reason: 'Kinetiq-only allocation holds kHYPE with no leverage and no liquidation risk. Net position is fully long HYPE via liquid staking. No structural hedge required.',
    }
  }

  // ── risk_notes ──────────────────────────────────────────────────────────────
  const risk_notes: string[] = [
    'Smart contract risk: Kinetiq and Felix are recently deployed on HyperEVM. Review available audits before committing capital.',
    'kHYPE liquidity: in stressed market conditions kHYPE may trade below HYPE parity. Verify the kHYPE:HYPE exchange rate before large redemptions.',
    `Price note: HYPE price ($${hype_price_usd.toFixed(4)}) is a live Hyperliquid spot mid fetched at plan generation time. Price may move significantly before execution.`,
  ]

  if (felixUsd > 0) {
    risk_notes.push(
      `Felix liquidation: a HYPE price decline of more than ~${dropTolerance}% from your entry price will push the trove toward the liquidation threshold (~${pct(FELIX_LIQ_THRESHOLD)}% LTV). Monitor the position and top up collateral if needed.`,
      'Felix liquidation is permissionless. A rapid HYPE price crash can result in partial or total collateral loss without warning or grace period.',
      'feUSD peg: feUSD is soft-pegged to $1 via the Felix CDP mechanism. In extreme conditions feUSD may depeg. Holding feUSD carries counterparty risk.',
    )
  }

  if (objective === 'leverage') {
    risk_notes.push(
      'Leverage amplifies both gains and losses. Borrowed feUSD must be repaid regardless of HYPE price performance.',
    )
  }

  if (felixUsd > 0 && risk_profile === 'aggressive') {
    risk_notes.push(
      'Aggressive LTV (70%): a 15–20% HYPE drawdown may bring the Felix trove into the active liquidation zone. Maintain the hedge short and set up collateral top-up alerts before execution.',
    )
  }

  // ── skipped_protocols ───────────────────────────────────────────────────────
  const skipped_protocols: SkippedProtocol[] = [
    {
      protocol: 'hyperlend',
      reason:   'PAUSED — HyperLend points season ended 2025-10-22. No new rewards available. Scanner remains active to detect existing positions. Re-evaluate when Round 3 / next season is announced.',
    },
    {
      protocol: 'hyperswap',
      reason:   'BLOCKED — no verified public pool list or subgraph for HyperSwap on HyperEVM. Required for feUSD → HYPE loop step; do not route swaps through unverified contracts.',
    },
  ]

  if (requested_capital_usd !== capital_usd) {
    risk_notes.unshift(
      `Capital capped: requested $${requested_capital_usd.toFixed(2)}, effective $${capital_usd.toFixed(2)}` +
      ` (wallet available_usd check — 2% reserve applied). All allocations use the effective amount.`,
    )
  }

  return {
    wallet,
    requested_capital_usd,
    capital_usd,
    hype_price_usd:  round4(hype_price_usd),
    hype_equivalent: round4(hype_equivalent),
    risk_profile,
    objective,
    allocation_json,
    execution_steps,
    hedge_required,
    risk_notes,
    skipped_protocols,
    generated_at: new Date().toISOString(),
  }
}
