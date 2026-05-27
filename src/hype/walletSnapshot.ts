// Fetches on-chain wallet balances on HyperEVM for pre-plan validation.
// Read-only. No signing. No writing. Only verified contract addresses are queried.

import { evmRpcUrl, padAddress, decodeUint256s, ethCall } from './evm'

// kHYPE — verified: kinetiq.xyz/docs/contracts-and-audits
const DEFAULT_KHYPE = '0xfD739d4e423301CE9385c1fb8850539D657C296D'

// USDC on HyperEVM: canonical contract address NOT verified in this system.
// WHYPE on HyperEVM: canonical contract address NOT verified in this system.
// Both are excluded from available_usd until verified.

const BALANCE_OF_SELECTOR = '70a08231'
const SCALE_18 = BigInt(1000000000) * BigInt(1000000000) // 10^18, split to avoid float

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ethGetBalance(wallet: string): Promise<bigint> {
  const res = await fetch(evmRpcUrl(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'eth_getBalance',
      params:  [wallet, 'latest'],
      id:      1,
    }),
  })
  if (!res.ok) throw new Error(`eth_getBalance HTTP ${res.status}`)
  const json = await res.json() as { result?: string; error?: { message: string } }
  if (json.error) throw new Error(`eth_getBalance: ${json.error.message}`)
  const raw = json.result ?? '0x0'
  return BigInt(raw.startsWith('0x') ? raw : '0x' + raw)
}

// Converts wei (18-decimal) to a float with 4-decimal precision using integer division.
function weiToToken18(wei: bigint): number {
  // Multiply by 10^4 before dividing to preserve 4 decimal places without float errors.
  return Number((wei * BigInt(10000)) / SCALE_18) / 10000
}

async function fetchErc20Balance18(contractAddr: string, wallet: string): Promise<number> {
  const calldata = '0x' + BALANCE_OF_SELECTOR + padAddress(wallet)
  const raw      = await ethCall(contractAddr, calldata)
  const values   = decodeUint256s(raw)
  return values.length > 0 ? weiToToken18(values[0]) : 0
}

function r2(n: number): number { return Math.round(n * 100)   / 100   }
function r4(n: number): number { return Math.round(n * 10000) / 10000 }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalletSnapshot {
  wallet:          string
  native_hype:     number   // raw token amount
  native_hype_usd: number
  khype_balance:   number
  khype_usd:       number
  usdc_balance:    number   // 0 — unverified contract
  usdc_usd:        number
  whype_balance:   number   // 0 — unverified contract
  whype_usd:       number
  available_usd:   number   // sum of verified liquid asset values
  gas_ok:          boolean
  min_gas_hype:    number
  warnings:        string[]
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchWalletSnapshot(
  wallet:      string,
  hypePrice:   number,
  minGasHype = 0.05,
): Promise<WalletSnapshot> {
  const warnings:     string[] = []
  const lowerWallet = wallet.toLowerCase()

  // Native HYPE (gas token on HyperEVM)
  let native_hype = 0
  try {
    const wei = await ethGetBalance(lowerWallet)
    native_hype = r4(weiToToken18(wei))
  } catch (err) {
    warnings.push(`Failed to fetch native HYPE balance: ${err instanceof Error ? err.message : String(err)}`)
  }

  // kHYPE ERC-20 (verified Kinetiq liquid staking receipt)
  let khype_balance = 0
  const kHypeAddr = (process.env.KHYPE_TOKEN_CONTRACT ?? DEFAULT_KHYPE).toLowerCase()
  try {
    khype_balance = r4(await fetchErc20Balance18(kHypeAddr, lowerWallet))
    if (khype_balance > 0) {
      warnings.push(
        `kHYPE balance of ${khype_balance.toFixed(4)} is already staked in Kinetiq. ` +
        `Counted in available_usd but requires unstaking before redeployment into a new allocation.`,
      )
    }
  } catch (err) {
    warnings.push(`Failed to fetch kHYPE balance: ${err instanceof Error ? err.message : String(err)}`)
  }

  // USDC — unverified on HyperEVM
  warnings.push('USDC contract address on HyperEVM is not verified in this system — USDC excluded from available_usd.')

  // WHYPE — unverified on HyperEVM
  warnings.push('WHYPE contract address on HyperEVM is not verified in this system — WHYPE excluded from available_usd.')

  const native_hype_usd = r2(native_hype  * hypePrice)
  const khype_usd       = r2(khype_balance * hypePrice)
  const available_usd   = r2(native_hype_usd + khype_usd)

  return {
    wallet:       lowerWallet,
    native_hype,
    native_hype_usd,
    khype_balance,
    khype_usd,
    usdc_balance: 0,
    usdc_usd:     0,
    whype_balance: 0,
    whype_usd:     0,
    available_usd,
    gas_ok:       native_hype >= minGasHype,
    min_gas_hype: minGasHype,
    warnings,
  }
}
