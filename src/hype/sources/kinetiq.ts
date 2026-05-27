import type { ProofRow } from '../types'
import { PROJECTS, KINETIQ_KEYS }               from '../../lib/hype-proofs'
import { log }                                   from '../logger'
import { withRetry }                             from '../retry'
import { ethCall, padAddress, decodeUint256s }   from '../evm'

// Kinetiq — liquid staking on HyperEVM
// Docs:            https://kinetiq.xyz/docs/contracts-and-audits
// kHYPE token:     0xfD739d4e423301CE9385c1fb8850539D657C296D  (verified from official docs)
// StakingManager:  0x393D0B87Ed38fc779FD9611144aE649BA6082109  (verified from official docs)
//
// Protocol uses kHYPE as its liquid staking receipt token — NOT stHYPE.
// Holding kHYPE proves the wallet has staked HYPE via the Kinetiq StakingManager.
// We read kHYPE balance via ERC-20 balanceOf (StakingManager not called directly).
//
// UI key mapping: the Lovable UI requirement key is `hold_stHYPE` (historical name);
// we map kHYPE balance > 0 to that key with value_text = "kHYPE held".
//
// points / snapshot: kPoints formula is explicitly private — not written.

// keccak256("balanceOf(address)")[0..3]
const BALANCE_OF_SELECTOR = '70a08231'
const TOKEN_DECIMALS      = 18

// Verified from official Kinetiq docs — env var overrides if provided.
const DEFAULT_KHYPE       = '0xfD739d4e423301CE9385c1fb8850539D657C296D'

// Documented for reference; not called directly (balanceOf on kHYPE token is sufficient).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STAKING_MANAGER     = '0x393D0B87Ed38fc779FD9611144aE649BA6082109'

function addr(w: string): string { return w.slice(0, 10) }
function now(): string { return new Date().toISOString() }

function makeProof(
  wallet: string,
  key:    string,
  opts: { value_text?: string | null; value_usd?: number | null } = {},
): ProofRow {
  return {
    wallet,
    project:         PROJECTS.KINETIQ,
    requirement_key: key,
    value_usd:       opts.value_usd  ?? null,
    value_text:      opts.value_text ?? null,
    proven_at:       now(),
    status:          'proven',
    notes:           null,
  }
}

export async function scanKinetiq(wallet: string): Promise<ProofRow[]> {
  const kHypeAddr = (process.env.KHYPE_TOKEN_CONTRACT ?? DEFAULT_KHYPE).toLowerCase()
  const calldata  = '0x' + BALANCE_OF_SELECTOR + padAddress(wallet)

  let balance = BigInt(0)
  try {
    const raw = await withRetry(
      () => ethCall(kHypeAddr, calldata),
      `Kinetiq kHYPE balanceOf ${wallet}`,
    )
    const values = decodeUint256s(raw)
    balance = values.length > 0 ? values[0] : BigInt(0)
  } catch (err) {
    log.warn(`Kinetiq    ${addr(wallet)}: kHYPE balanceOf failed — ${err instanceof Error ? err.message : String(err)}`)
    return []
  }

  if (balance === BigInt(0)) {
    log.info(`Kinetiq    ${addr(wallet)}: no kHYPE balance`)
    return []
  }

  const amount = Number(balance) / 10 ** TOKEN_DECIMALS
  const label  = `${amount.toFixed(4)} kHYPE`

  const proofs: ProofRow[] = [
    // Requirement proofs
    makeProof(wallet, KINETIQ_KEYS.STAKE,        {}),
    makeProof(wallet, KINETIQ_KEYS.HOLD_STHYPE,  { value_text: 'kHYPE held' }),  // UI key maps kHYPE → hold_stHYPE
    // Metric cells
    makeProof(wallet, KINETIQ_KEYS.STAKED,        { value_text: label }),
    makeProof(wallet, KINETIQ_KEYS.STHYPE,        { value_text: label }),
  ]

  log.info(`Kinetiq    ${addr(wallet)}: ${proofs.length} proof(s) — kHYPE=${amount.toFixed(4)}`)
  return proofs
}
