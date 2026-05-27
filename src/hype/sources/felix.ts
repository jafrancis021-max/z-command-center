import type { ProofRow } from '../types'
import { PROJECTS, FELIX_KEYS }                           from '../../lib/hype-proofs'
import { log }                                            from '../logger'
import { withRetry }                                      from '../retry'
import { ethCall, padAddress, padUint256, decodeUint256s } from '../evm'

// Felix Protocol — Liquity v2 fork on HyperEVM
// Docs: https://usefelix.gitbook.io/docs/developers/market-1-feusd-cdp
//
// wallet → troveId mapping (verified):
//   TroveNFT implements ERC721Enumerable (confirmed HyperEVMScan 2025-05).
//   Each collateral branch has its own TroveNFT contract.
//   tokenOfOwnerByIndex(address,uint256) = 0x2f745c59  → returns troveId (uint256 NFT ID)
//
// getLatestTroveData(uint256 _troveId) = 0xaad3f404  (4byte.directory 2025-05-18, Liquity v2)
//   Returns LatestTroveData struct; ABI-decoded as flat uint256 array:
//     [0] entireColl  — collateral in token units
//     [1] entireDebt  — feUSD debt (18 decimals, feUSD ≈ $1)
//
// Branch mapping (all verified from Felix docs):
//   WHYPE  TroveNFT 0x5ad1... TroveManager 0x3100...  collDecimals=18
//   UBTC   TroveNFT 0xad8a... TroveManager 0xbbe5...  collDecimals=8
//   kHYPE  TroveNFT 0x9d08... TroveManager 0x7c07...  collDecimals=18
//
// Keys NOT written: snapshot, points — no off-chain API available.

const BALANCE_OF_SEL               = '70a08231'
const TOKEN_OF_OWNER_BY_INDEX_SEL  = '2f745c59'
const GET_LATEST_TROVE_DATA_SEL    = 'aad3f404'
const FEUSD_DECIMALS               = 18

interface Branch {
  name:         string
  troveNFT:     string
  troveManager: string
  collDecimals: number
}

const BRANCHES: Branch[] = [
  { name: 'WHYPE', troveNFT: '0x5ad1512e7006fdbd0f3ebb8aa35c5e9234a03aa7', troveManager: '0x3100f4e7bda2ed2452d9a57eb30260ab071bbe62', collDecimals: 18 },
  { name: 'UBTC',  troveNFT: '0xad8a43ac8da98990efa4d5ec7b91135965d5846b', troveManager: '0xbbe5f227275f24b64bd290a91f55723a00214885', collDecimals: 8  },
  { name: 'kHYPE', troveNFT: '0x9d08780deec2270b8296f520b3fb28346abf6036', troveManager: '0x7c07bb77b1cf9a5b40d92f805c10d90c90957e4a', collDecimals: 18 },
]

function addr(wallet: string): string { return wallet.slice(0, 10) }
function now(): string { return new Date().toISOString() }

function makeProof(
  wallet: string,
  key:    string,
  opts: { value_usd?: number | null; value_text?: string | null } = {},
): ProofRow {
  return {
    wallet,
    project:         PROJECTS.FELIX,
    requirement_key: key,
    value_usd:       opts.value_usd  ?? null,
    value_text:      opts.value_text ?? null,
    proven_at:       now(),
    status:          'proven',
    notes:           null,
  }
}

async function troveCount(troveNFT: string, wallet: string): Promise<number> {
  const raw = await ethCall(troveNFT, '0x' + BALANCE_OF_SEL + padAddress(wallet))
  const v   = decodeUint256s(raw)
  return v.length > 0 ? Number(v[0]) : 0
}

async function troveIdAt(troveNFT: string, wallet: string, index: number): Promise<bigint> {
  const data = '0x' + TOKEN_OF_OWNER_BY_INDEX_SEL + padAddress(wallet) + padUint256(BigInt(index))
  const raw  = await ethCall(troveNFT, data)
  const v    = decodeUint256s(raw)
  return v.length > 0 ? v[0] : BigInt(0)
}

interface TroveData { coll: bigint; debt: bigint }

async function latestTroveData(troveManager: string, troveId: bigint): Promise<TroveData> {
  const data = '0x' + GET_LATEST_TROVE_DATA_SEL + padUint256(troveId)
  const raw  = await ethCall(troveManager, data)
  const v    = decodeUint256s(raw)
  return { coll: v[0] ?? BigInt(0), debt: v[1] ?? BigInt(0) }
}

export async function scanFelix(wallet: string): Promise<ProofRow[]> {
  const allProofs: ProofRow[] = []
  let totalColl    = BigInt(0)
  let totalDebtUsd = 0

  for (const branch of BRANCHES) {
    let count = 0
    try {
      count = await withRetry(() => troveCount(branch.troveNFT, wallet), `Felix ${branch.name} count ${wallet}`)
    } catch (err) {
      log.warn(`Felix      ${addr(wallet)}: ${branch.name} count failed — ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    if (count === 0) {
      log.info(`Felix      ${addr(wallet)}: ${branch.name} → 0 troves`)
      continue
    }

    log.info(`Felix      ${addr(wallet)}: ${branch.name} → ${count} trove(s)`)

    for (let i = 0; i < count; i++) {
      let troveId: bigint
      try {
        troveId = await withRetry(
          () => troveIdAt(branch.troveNFT, wallet, i),
          `Felix ${branch.name} troveIdAt[${i}] ${wallet}`,
        )
      } catch {
        continue
      }
      if (troveId === BigInt(0)) continue

      let data: TroveData
      try {
        // No retry: reverted getLatestTroveData (closed trove) will always fail — skip immediately.
        data = await latestTroveData(branch.troveManager, troveId)
      } catch {
        continue
      }

      if (data.coll > BigInt(0)) {
        const amount = Number(data.coll) / 10 ** branch.collDecimals
        totalColl   += data.coll
        allProofs.push(makeProof(wallet, FELIX_KEYS.SUPPLIED, { value_text: `${amount.toFixed(4)} ${branch.name}` }))
        allProofs.push(makeProof(wallet, FELIX_KEYS.SUPPLY))
      }

      if (data.debt > BigInt(0)) {
        const debtUsd = Number(data.debt) / 10 ** FEUSD_DECIMALS
        totalDebtUsd += debtUsd
        allProofs.push(makeProof(wallet, FELIX_KEYS.BORROWED, { value_usd: debtUsd }))
        allProofs.push(makeProof(wallet, FELIX_KEYS.BORROW))
      }
    }
  }

  if (totalColl > BigInt(0) && totalDebtUsd > 0) {
    allProofs.push(makeProof(wallet, FELIX_KEYS.SHARED_CREDIT))
  }

  // Deduplicate by requirement_key — last write per key wins (multiple troves same wallet).
  const deduped = new Map<string, ProofRow>()
  for (const p of allProofs) deduped.set(p.requirement_key, p)
  const proofs = [...deduped.values()]

  if (proofs.length === 0) {
    log.info(`Felix      ${addr(wallet)}: no troves found (checked WHYPE, UBTC, kHYPE)`)
  } else {
    log.info(`Felix      ${addr(wallet)}: ${proofs.length} proof(s) — debt=$${totalDebtUsd.toFixed(2)}`)
  }

  return proofs
}
