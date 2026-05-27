import type { ProofRow } from '../types'
import { PROJECTS, HYPERLEND_KEYS }                from '../../lib/hype-proofs'
import { log }                                     from '../logger'
import { withRetry }                               from '../retry'
import { ethCall, padAddress, decodeUint256s }     from '../evm'

// HyperLend — Aave v3 fork on HyperEVM
// Docs:     https://docs.hyperlend.finance/developer-documentation/contract-addresses
// IPool:    0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b  (verified on HyperEVMScan)
// Function: getUserAccountData(address)  selector 0x35ea6a75
// Returns:  [totalCollateralBase, totalDebtBase, availableBorrows, liqThreshold, ltv, healthFactor]
//           All values in Aave v3 USD base units (8 decimals).

const SELECTOR    = '35ea6a75'
const UINT256_MAX = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
const WAD         = BigInt('1000000000000000000')
const BASE_DEC    = 8

// Verified pool address — env var overrides if provided.
const DEFAULT_POOL = '0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b'

function baseToUsd(base: bigint): number {
  return Number(base) / 10 ** BASE_DEC
}

function addr(wallet: string): string {
  return wallet.slice(0, 10)
}

function now(): string {
  return new Date().toISOString()
}

function makeProof(
  wallet: string,
  key:    string,
  opts: { value_usd?: number | null; value_text?: string | null } = {},
): ProofRow {
  return {
    wallet,
    project:         PROJECTS.HYPERLEND,
    requirement_key: key,
    value_usd:       opts.value_usd  ?? null,
    value_text:      opts.value_text ?? null,
    proven_at:       now(),
    status:          'proven',
    notes:           null,
  }
}

export async function scanHyperLend(wallet: string): Promise<ProofRow[]> {
  const poolAddress = (process.env.HYPERLEND_POOL_ADDRESS ?? DEFAULT_POOL).toLowerCase()
  const calldata    = '0x' + SELECTOR + padAddress(wallet)

  let raw: string
  try {
    raw = await withRetry(
      () => ethCall(poolAddress, calldata),
      `HyperLend getUserAccountData ${wallet}`,
    )
  } catch (err) {
    log.warn(`HyperLend  ${addr(wallet)}: [PAUSED — season ended 2025-10-22] eth_call failed — ${err instanceof Error ? err.message : String(err)}`)
    return []
  }

  const values = decodeUint256s(raw)
  if (values.length < 6) {
    log.warn(`HyperLend  ${addr(wallet)}: [PAUSED — season ended 2025-10-22] unexpected response length ${values.length}`)
    return []
  }

  const [totalCollateralBase, totalDebtBase, , , , healthFactor] = values

  const hasCollateral = totalCollateralBase > BigInt(0)
  const hasDebt       = totalDebtBase > BigInt(0)

  if (!hasCollateral && !hasDebt) {
    log.info(`HyperLend  ${addr(wallet)}: [PAUSED — season ended 2025-10-22] no position (collateral=0, debt=0)`)
    return []
  }

  const proofs: ProofRow[] = []

  if (hasCollateral) {
    const usd = baseToUsd(totalCollateralBase)
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.SUPPLIED, { value_usd: usd }))
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.SUPPLY,   { value_usd: usd }))
  }

  if (hasDebt) {
    const usd = baseToUsd(totalDebtBase)
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.BORROWED, { value_usd: usd }))
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.BORROW,   { value_usd: usd }))
  }

  if (hasDebt && healthFactor !== UINT256_MAX) {
    const hf = Number(healthFactor) / Number(WAD)
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.HF, { value_text: hf.toFixed(4) }))
  }

  if (hasCollateral && hasDebt) {
    proofs.push(makeProof(wallet, HYPERLEND_KEYS.SHARED_CREDIT))
  }

  const collStr = hasCollateral ? `collateral=$${baseToUsd(totalCollateralBase).toFixed(2)}` : ''
  const debtStr = hasDebt       ? `debt=$${baseToUsd(totalDebtBase).toFixed(2)}`             : ''
  log.info(`HyperLend  ${addr(wallet)}: [PAUSED — season ended 2025-10-22] ${proofs.length} proof(s) — ${[collStr, debtStr].filter(Boolean).join(' ')}`)

  // claims_scan: RewardsController exists but reward asset list is unverified — not written.

  return proofs
}
