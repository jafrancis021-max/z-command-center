import type { ProofRow } from '../types'
import { PROJECTS, HYPERLIQUID_KEYS } from '../../lib/hype-proofs'
import { log }       from '../logger'
import { withRetry } from '../retry'

const DEFAULT_API    = 'https://api.hyperliquid.xyz'
const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function getApiUrl(): string {
  return (process.env.HYPERLIQUID_API_URL ?? DEFAULT_API).replace(/\/$/, '')
}

async function hlPost<T>(
  type:  string,
  user:  string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${getApiUrl()}/info`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type, user, ...extra }),
  })
  if (!res.ok) throw new Error(`HL API ${type} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface ClearinghouseState {
  marginSummary:  { accountValue: string; totalNtlPos: string }
  assetPositions: Array<{
    position: { coin: string; szi: string; entryPx: string | null }
  }>
}

interface SpotBalance {
  coin: string; hold: string; entryNtl: string; total: string
}

interface SpotClearinghouseState {
  balances: SpotBalance[]
}

interface Fill {
  coin:   string
  px:     string
  sz:     string
  side:   string
  time:   number
  hash?:  string
}

interface ExtraAgent {
  address: string; name: string; validUntil: number
}

interface LedgerEntry {
  time:   number
  hash?:  string
  delta?: { type: string; usdc?: string; [key: string]: unknown }
}

function now(): string {
  return new Date().toISOString()
}

function validHash(h?: string | null): string | null {
  return typeof h === 'string' && h.startsWith('0x') ? h : null
}

function makeProof(
  wallet: string,
  key:    string,
  opts: {
    value_usd?:  number | null
    value_text?: string | null
    tx_hash?:    string | null
    notes?:      string | null
  } = {},
): ProofRow {
  return {
    wallet,
    project:         PROJECTS.HYPERLIQUID,
    requirement_key: key,
    value_usd:       opts.value_usd  ?? null,
    value_text:      opts.value_text ?? null,
    tx_hash:         opts.tx_hash    ?? null,
    proven_at:       now(),
    status:          'proven',
    notes:           opts.notes ?? null,
  }
}

export async function checkHyperliquid(wallet: string): Promise<ProofRow[]> {
  const startTime = Date.now() - THIRTY_DAYS_MS

  const [perpsResult, spotResult, fillsResult, agentsResult, ledgerResult] = await Promise.allSettled([
    withRetry(() => hlPost<ClearinghouseState>('clearinghouseState', wallet),          `HL perps ${wallet}`),
    withRetry(() => hlPost<SpotClearinghouseState>('spotClearinghouseState', wallet),  `HL spot ${wallet}`),
    withRetry(() => hlPost<Fill[]>('userFills', wallet),                               `HL fills ${wallet}`),
    withRetry(() => hlPost<ExtraAgent[]>('extraAgents', wallet),                       `HL agents ${wallet}`),
    withRetry(
      () => hlPost<LedgerEntry[]>('userNonFundingLedgerUpdates', wallet, { startTime }),
      `HL ledger ${wallet}`,
    ),
  ])

  const proofs: ProofRow[] = []

  // ── Ledger: most recent deposit tx_hash ───────────────────────────────────
  let depositTxHash: string | null = null
  if (ledgerResult.status === 'fulfilled' && Array.isArray(ledgerResult.value)) {
    const deposits = ledgerResult.value
      .filter(e => e.delta?.type === 'deposit')
      .sort((a, b) => b.time - a.time)
    depositTxHash = deposits.length > 0 ? validHash(deposits[0].hash) : null
  }

  // ── Fills: spot detection + 7-day volume ──────────────────────────────────
  let spotSwapTxHash: string | null = null
  let spotVol7d  = 0
  let hasSpotFills = false

  if (fillsResult.status === 'fulfilled') {
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS
    const spotFills    = fillsResult.value.filter(f => f.coin.startsWith('@'))

    if (spotFills.length > 0) {
      hasSpotFills   = true
      const sorted   = spotFills.slice().sort((a, b) => b.time - a.time)
      spotSwapTxHash = validHash(sorted[0].hash)
      spotVol7d      = spotFills
        .filter(f => f.time >= sevenDaysAgo)
        .reduce((sum, f) => sum + parseFloat(f.px) * Math.abs(parseFloat(f.sz)), 0)
    }
  }

  // ── Perps ──────────────────────────────────────────────────────────────────
  if (perpsResult.status === 'fulfilled') {
    const perps      = perpsResult.value
    const accountVal = parseFloat(perps.marginSummary.accountValue)
    const ntlPos     = parseFloat(perps.marginSummary.totalNtlPos)

    if (accountVal > 0) {
      proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.COLLATERAL,   { value_usd: accountVal }))
      proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.PERPS_DEPOSIT, {
        value_usd: accountVal,
        tx_hash:   depositTxHash,
      }))
    }

    if (ntlPos > 0) {
      proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.PERPS_SIZE, { value_usd: ntlPos }))
    }

    for (const ap of perps.assetPositions) {
      const szi = parseFloat(ap.position.szi)
      if (szi < 0) {
        const entryPx  = parseFloat(ap.position.entryPx ?? '0')
        const notional = Math.abs(szi) * entryPx
        proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.PERPS_SHORT, {
          value_usd:  notional > 0 ? notional : null,
          value_text: `${ap.position.coin} szi=${szi}`,
        }))
        break
      }
    }
  }

  // ── Spot balance → spot_swap ───────────────────────────────────────────────
  let hasSpotBalance = false
  if (spotResult.status === 'fulfilled') {
    const active = spotResult.value.balances.filter(b => parseFloat(b.total) > 0)
    if (active.length > 0) {
      hasSpotBalance = true
      proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.SPOT_SWAP, { tx_hash: spotSwapTxHash }))
    }
  }

  // ── Spot fills fallback for spot_swap ─────────────────────────────────────
  if (!hasSpotBalance && hasSpotFills) {
    proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.SPOT_SWAP, { tx_hash: spotSwapTxHash }))
  }

  // ── Spot vol: 7-day from fills only ───────────────────────────────────────
  if (fillsResult.status === 'rejected') {
    log.warn(`spot_vol unavailable for ${wallet}: fills API failed`)
  } else if (spotVol7d > 0) {
    proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.SPOT_VOL, { value_usd: spotVol7d }))
  }

  // ── API agents ─────────────────────────────────────────────────────────────
  if (agentsResult.status === 'fulfilled' && agentsResult.value.length > 0) {
    const names = agentsResult.value.map(a => a.name).filter(Boolean).join(',')
    proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.AGENT,         { value_text: names || null }))
    proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.AGENT_APPROVE, {}))
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  const hasPerpsActivity =
    perpsResult.status === 'fulfilled' &&
    (parseFloat(perpsResult.value.marginSummary.accountValue) > 0 ||
     perpsResult.value.assetPositions.length > 0)

  const hasFillActivity =
    fillsResult.status === 'fulfilled' && fillsResult.value.length > 0

  if (hasPerpsActivity || hasSpotBalance || hasSpotFills || hasFillActivity) {
    proofs.push(makeProof(wallet, HYPERLIQUID_KEYS.ACTIVITY, { value_text: 'active' }))
  }

  return proofs
}
