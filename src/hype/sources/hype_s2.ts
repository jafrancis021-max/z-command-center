import type { ProofRow } from '../types'
import { PROJECTS, HYPE_S2_KEYS }            from '../../lib/hype-proofs'
import { withRetry }                          from '../retry'
import { hlPost }                             from '../hl'
import type { HlPerpsState, HlFill, HlAgent } from '../hl'

// HYPE Season 2 eligibility — derived from Hyperliquid on-chain activity.
// Source: Hyperliquid Info API (https://api.hyperliquid.xyz/info)
// Requirements per project spec: perps_open, agent, activity.

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function now(): string { return new Date().toISOString() }

function makeProof(
  wallet: string,
  key:    string,
  opts: { value_usd?: number | null; value_text?: string | null } = {},
): ProofRow {
  return {
    wallet,
    project:         PROJECTS.HYPE_S2,
    requirement_key: key,
    value_usd:       opts.value_usd  ?? null,
    value_text:      opts.value_text ?? null,
    proven_at:       now(),
    status:          'proven',
    notes:           null,
  }
}

export async function checkHypeS2(wallet: string): Promise<ProofRow[]> {
  const startTime = Date.now() - THIRTY_DAYS_MS

  const [perpsResult, fillsResult, agentsResult] = await Promise.allSettled([
    withRetry(() => hlPost<HlPerpsState>('clearinghouseState', wallet), `S2 perps ${wallet}`),
    withRetry(() => hlPost<HlFill[]>('userFills', wallet),              `S2 fills ${wallet}`),
    withRetry(() => hlPost<HlAgent[]>('extraAgents', wallet),           `S2 agents ${wallet}`),
  ])

  const proofs: ProofRow[] = []

  // ── perps_open: has currently open perps position ──────────────────────────
  let hasPerpsActivity = false
  if (perpsResult.status === 'fulfilled') {
    const ntlPos     = parseFloat(perpsResult.value.marginSummary.totalNtlPos)
    const accountVal = parseFloat(perpsResult.value.marginSummary.accountValue)
    hasPerpsActivity = accountVal > 0 || perpsResult.value.assetPositions.length > 0

    if (ntlPos > 0) {
      proofs.push(makeProof(wallet, HYPE_S2_KEYS.PERPS_OPEN, { value_usd: ntlPos }))
    }
  }

  // ── fills: 30-day perps volume + active_days ───────────────────────────────
  let hasFillActivity = false
  if (fillsResult.status === 'fulfilled') {
    const fills         = fillsResult.value
    const recentFills   = fills.filter(f => f.time >= startTime)
    hasFillActivity     = fills.length > 0
    const perpsFills    = recentFills.filter(f => !f.coin.startsWith('@'))

    // 30-day perps fill volume (USD)
    const perpsVol30d = perpsFills.reduce(
      (sum, f) => sum + parseFloat(f.px) * Math.abs(parseFloat(f.sz)), 0,
    )
    if (perpsVol30d > 0) {
      proofs.push(makeProof(wallet, HYPE_S2_KEYS.PERPS_VOL, { value_usd: perpsVol30d }))
    }

    // active_days: unique UTC calendar days with any fill in last 30 days
    const days = new Set(recentFills.map(f => new Date(f.time).toISOString().slice(0, 10)))
    if (days.size > 0) {
      proofs.push(makeProof(wallet, HYPE_S2_KEYS.ACTIVE_DAYS, { value_text: String(days.size) }))
    }
  }

  // ── agent: has configured API agent ───────────────────────────────────────
  if (agentsResult.status === 'fulfilled' && agentsResult.value.length > 0) {
    const names = agentsResult.value.map(a => a.name).filter(Boolean).join(',')
    proofs.push(makeProof(wallet, HYPE_S2_KEYS.AGENT, { value_text: names || null }))
  }

  // ── activity: any perps, spot, or fill activity ───────────────────────────
  if (hasPerpsActivity || hasFillActivity) {
    proofs.push(makeProof(wallet, HYPE_S2_KEYS.ACTIVITY, { value_text: 'active' }))
  }

  // ── points: HYPE S2 points formula is proprietary — not written ───────────

  return proofs
}
