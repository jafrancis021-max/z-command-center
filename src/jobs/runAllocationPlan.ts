/**
 * src/jobs/runAllocationPlan.ts — HYPE member allocation planner (planning only).
 *
 * Fetches wallet balances, validates capital availability, then produces a
 * structured allocation plan. No transactions are executed.
 *
 * Run:
 *   PLAN_WALLET=0x...  PLAN_CAPITAL=10000  PLAN_RISK=moderate  PLAN_OBJECTIVE=accumulate_hype  npm run hype:plan
 *
 * Required env vars:
 *   PLAN_WALLET       wallet address to plan for
 *   PLAN_CAPITAL      capital in USD (e.g. 10000)
 *   PLAN_RISK         conservative | moderate | aggressive
 *   PLAN_OBJECTIVE    accumulate_hype | generate_yield | leverage | diversify
 *
 * Optional env vars:
 *   HYPE_PRICE_USD        override live price fetch (useful for testing)
 *   PLAN_ALLOW_CAP        set to "true" to cap plan to available wallet balance instead of failing (default: false)
 *   PLAN_MIN_GAS_HYPE     minimum native HYPE required for gas (default: 0.05)
 *   HYPERLIQUID_API_URL   (default: https://api.hyperliquid.xyz)
 *   PLAN_PERSIST          set to "true" to save plan + intents + steps to Supabase
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'

function loadEnvFile(): void {
  for (const name of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), name)
    if (!existsSync(filePath)) continue
    const raw = readFileSync(filePath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
      if (key && !(key in process.env)) process.env[key] = val
    }
    return
  }
}

loadEnvFile()

import { buildAllocationPlan, fetchHypePrice } from '../hype/planner'
import type { RiskProfile, Objective, AllocationPlan } from '../hype/planner'
import { buildExecutionPipeline }  from '../hype/pipeline'
import { persistPlan }             from '../hype/db'
import { fetchWalletSnapshot }     from '../hype/walletSnapshot'
import type { WalletSnapshot }     from '../hype/walletSnapshot'

const VALID_RISK:      RiskProfile[] = ['conservative', 'moderate', 'aggressive']
const VALID_OBJECTIVE: Objective[]   = ['accumulate_hype', 'generate_yield', 'leverage', 'diversify']

function sep(char = '─', width = 70): string { return char.repeat(width) }
function usd(n: number): string { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

function printSnapshot(snap: WalletSnapshot, hypePrice: number): void {
  console.log('\n' + sep() + '\nWallet Snapshot  (HyperEVM)\n' + sep())
  console.log(`  Wallet:         ${snap.wallet}`)
  console.log(`  Native HYPE:    ${snap.native_hype.toFixed(4)} HYPE  (${usd(snap.native_hype_usd)})`)
  console.log(`  kHYPE:          ${snap.khype_balance.toFixed(4)} kHYPE  (${usd(snap.khype_usd)})`)
  console.log(`  USDC:           unverified — excluded`)
  console.log(`  WHYPE:          unverified — excluded`)
  console.log(`  Available USD:  ${usd(snap.available_usd)}  (native HYPE + kHYPE at $${hypePrice.toFixed(2)}/HYPE)`)
  console.log(`  Gas OK:         ${snap.gas_ok ? 'YES' : `NO — needs ≥${snap.min_gas_hype} HYPE (has ${snap.native_hype.toFixed(4)})`}`)
  if (snap.warnings.length > 0) {
    console.log('\n  Warnings:')
    for (const w of snap.warnings) {
      const words = w.split(' ')
      let line = '    ⚠ '
      for (const word of words) {
        if (line.length + word.length + 1 > 78) { console.log(line); line = '      ' + word + ' ' }
        else line += word + ' '
      }
      if (line.trim()) console.log(line)
    }
  }
}

function printPlan(plan: AllocationPlan, snap: WalletSnapshot | null): void {
  console.log('\n' + sep('═'))
  console.log('HYPE Allocation Plan')
  console.log(sep('═'))
  console.log(`Wallet:            ${plan.wallet}`)
  if (snap) {
    console.log(`Wallet balance:    ${usd(snap.available_usd)} available`)
  }
  if (plan.requested_capital_usd !== plan.capital_usd) {
    console.log(`Requested capital: ${usd(plan.requested_capital_usd)}  ⚠ capped`)
    console.log(`Effective capital: ${usd(plan.capital_usd)}`)
  } else {
    console.log(`Capital:           ${usd(plan.capital_usd)}`)
  }
  console.log(`HYPE price:        $${plan.hype_price_usd} (live Hyperliquid spot mid)`)
  console.log(`HYPE equiv:        ~${plan.hype_equivalent} HYPE`)
  console.log(`Risk profile:      ${plan.risk_profile}`)
  console.log(`Objective:         ${plan.objective}`)
  console.log(`Generated at:      ${plan.generated_at}`)

  console.log('\n' + sep() + '\nAllocation\n' + sep())
  for (const a of plan.allocation_json) {
    console.log(`\n  [${a.protocol.toUpperCase()}]  ${a.action}  (status: ${a.status})`)
    console.log(`    USD:     ${usd(a.usd_amount)} — ${a.pct_of_capital}% of capital`)
    console.log(`    HYPE:    ~${a.hype_equivalent}`)
    console.log(`    Output:  ${a.expected_output}`)
  }

  console.log('\n' + sep() + '\nExecution Steps  (planning only — no transactions executed)\n' + sep())
  for (const s of plan.execution_steps) {
    const usdStr = s.amount_usd > 0 ? `  ${usd(s.amount_usd)}` : ''
    console.log(`\n  Step ${s.step}:  [${s.protocol.toUpperCase()}]  ${s.action}${usdStr}`)
    const words = s.notes.split(' ')
    let line = '    '
    for (const word of words) {
      if (line.length + word.length + 1 > 76) { console.log(line); line = '    ' + word + ' ' }
      else line += word + ' '
    }
    if (line.trim()) console.log(line)
  }

  console.log('\n' + sep() + '\nHedge Requirement\n' + sep())
  console.log(`  Required:  ${plan.hedge_required.required ? 'YES' : 'NO'}`)
  console.log(`  Reason:    ${plan.hedge_required.reason}`)
  if (plan.hedge_required.suggested_hedge) {
    console.log(`  Suggested: ${plan.hedge_required.suggested_hedge}`)
  }

  console.log('\n' + sep() + '\nRisk Notes\n' + sep())
  for (const note of plan.risk_notes) {
    const words = note.split(' ')
    let line = '  • '
    for (const word of words) {
      if (line.length + word.length + 1 > 76) { console.log(line); line = '    ' + word + ' ' }
      else line += word + ' '
    }
    if (line.trim()) console.log(line)
  }

  console.log('\n' + sep() + '\nSkipped Protocols\n' + sep())
  for (const s of plan.skipped_protocols) {
    console.log(`\n  [${s.protocol.toUpperCase()}]`)
    const words = s.reason.split(' ')
    let line = '  '
    for (const word of words) {
      if (line.length + word.length + 1 > 76) { console.log(line); line = '  ' + word + ' ' }
      else line += word + ' '
    }
    if (line.trim()) console.log(line)
  }

  console.log('\n' + sep() + '\nallocation_json  (machine-readable)\n' + sep())
  console.log(JSON.stringify(plan.allocation_json, null, 2))

  console.log('\n' + sep('═'))
  console.log('Plan complete — for planning only. No transactions have been executed.')
  console.log(sep('═'))
}

async function main(): Promise<void> {
  const walletRaw    = process.env.PLAN_WALLET
  const capitalRaw   = process.env.PLAN_CAPITAL
  const riskRaw      = process.env.PLAN_RISK      as RiskProfile | undefined
  const objectiveRaw = process.env.PLAN_OBJECTIVE as Objective   | undefined
  const persist      = process.env.PLAN_PERSIST   === 'true'
  const allowCap     = process.env.PLAN_ALLOW_CAP === 'true'
  const minGasHype   = parseFloat(process.env.PLAN_MIN_GAS_HYPE ?? '0.05')

  // ── Input validation ────────────────────────────────────────────────────────
  const errs: string[] = []
  if (!walletRaw)                                                  errs.push('PLAN_WALLET is required')
  if (!capitalRaw)                                                 errs.push('PLAN_CAPITAL is required')
  if (!riskRaw)                                                    errs.push('PLAN_RISK is required')
  if (!objectiveRaw)                                               errs.push('PLAN_OBJECTIVE is required')
  if (riskRaw      && !VALID_RISK.includes(riskRaw))              errs.push(`PLAN_RISK must be one of: ${VALID_RISK.join(', ')}`)
  if (objectiveRaw && !VALID_OBJECTIVE.includes(objectiveRaw))    errs.push(`PLAN_OBJECTIVE must be one of: ${VALID_OBJECTIVE.join(', ')}`)

  const requested_capital = parseFloat(capitalRaw ?? '0')
  if (!Number.isFinite(requested_capital) || requested_capital <= 0) errs.push('PLAN_CAPITAL must be a positive number')

  if (errs.length > 0) {
    console.error('Input errors:')
    for (const e of errs) console.error(`  - ${e}`)
    console.error('\nExample:')
    console.error('  PLAN_WALLET=0x...  PLAN_CAPITAL=10000  PLAN_RISK=moderate  PLAN_OBJECTIVE=accumulate_hype  npm run hype:plan')
    process.exit(1)
  }

  const wallet = walletRaw!

  // ── Fetch HYPE price once ────────────────────────────────────────────────────
  console.log('Fetching live HYPE price...')
  let hypePrice: number
  try {
    hypePrice = await fetchHypePrice()
    // Cache in env so buildAllocationPlan reuses the same price — avoids double fetch.
    process.env.HYPE_PRICE_USD = hypePrice.toString()
    console.log(`HYPE price: $${hypePrice.toFixed(4)}\n`)
  } catch (err) {
    console.error(`Fatal: could not fetch HYPE price — ${err instanceof Error ? err.message : String(err)}`)
    console.error('Set HYPE_PRICE_USD env var to override.')
    process.exit(1)
  }

  // ── Wallet snapshot ──────────────────────────────────────────────────────────
  console.log('Fetching wallet snapshot...')
  let snap: WalletSnapshot | null = null
  try {
    snap = await fetchWalletSnapshot(wallet, hypePrice, Number.isFinite(minGasHype) && minGasHype > 0 ? minGasHype : 0.05)
    printSnapshot(snap, hypePrice)
  } catch (err) {
    console.error(`Warning: wallet snapshot failed — ${err instanceof Error ? err.message : String(err)}`)
    console.error('Proceeding without balance pre-check. Set PLAN_ALLOW_CAP=true to suppress this gate.\n')
  }

  // ── Gas check ────────────────────────────────────────────────────────────────
  if (snap && !snap.gas_ok) {
    console.error(
      `\nFATAL: Wallet needs at least ${snap.min_gas_hype} HYPE for gas before execution planning.\n` +
      `       Current native HYPE: ${snap.native_hype.toFixed(6)} HYPE\n` +
      `       Fund the wallet with native HYPE before running this plan.`,
    )
    process.exit(1)
  }

  // ── Capital check / cap ──────────────────────────────────────────────────────
  let effective_capital = requested_capital

  if (snap && requested_capital > snap.available_usd) {
    if (!allowCap) {
      console.error(
        `\nFATAL: PLAN_CAPITAL (${usd(requested_capital)}) exceeds wallet available (${usd(snap.available_usd)}).\n` +
        `       Reduce PLAN_CAPITAL or fund the wallet.\n` +
        `       To auto-cap the plan to available balance, set PLAN_ALLOW_CAP=true.`,
      )
      process.exit(1)
    }

    // Cap to 98% of available balance (2% reserve for gas and rounding)
    effective_capital = Math.floor(snap.available_usd * 0.98 * 100) / 100
    console.log(
      `\n⚠  PLAN_CAPITAL capped from ${usd(requested_capital)} to ${usd(effective_capital)} ` +
      `based on wallet balance (${usd(snap.available_usd)} available, 2% reserve applied).`,
    )

    if (effective_capital <= 0) {
      console.error(`\nFATAL: Effective capital after 2% reserve is ${usd(effective_capital)} — nothing to plan.`)
      process.exit(1)
    }
  }

  // ── Build plan ───────────────────────────────────────────────────────────────
  try {
    const plan = await buildAllocationPlan({
      wallet,
      capital_usd:            effective_capital,
      requested_capital_usd:  requested_capital,
      risk_profile:           riskRaw!,
      objective:              objectiveRaw!,
    })

    // Append snapshot summary to risk_notes so it persists with the plan
    if (snap) {
      plan.risk_notes.push(
        `Wallet snapshot at plan time: native HYPE ${snap.native_hype.toFixed(4)} (${usd(snap.native_hype_usd)}), ` +
        `kHYPE ${snap.khype_balance.toFixed(4)} (${usd(snap.khype_usd)}), ` +
        `available_usd ${usd(snap.available_usd)}.`,
      )
    }

    printPlan(plan, snap)

    if (persist) {
      console.log('\nPersisting plan to Supabase...')
      const pipeline  = buildExecutionPipeline(plan)
      const persisted = await persistPlan(pipeline)
      console.log(`\nPersisted successfully:`)
      console.log(`  plan_id:    ${persisted.plan_id}`)
      console.log(`  intents:    ${persisted.intent_ids.length} rows`)
      console.log(`  steps:      ${persisted.step_ids.length} rows`)
      console.log(`\nQuery: SELECT * FROM member_allocation_plans WHERE id = '${persisted.plan_id}';`)
    }
  } catch (err) {
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
