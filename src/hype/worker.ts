import type { WalletScanResult, ScanStats, ProofRow } from './types'
import { log }                               from './logger'
import { sleep }                             from './retry'
import { validateAndNormalize }              from './wallet'
import { loadMemberWallets }                from './supabase'
import { checkHyperliquid }                 from './sources/hyperliquid'
import { scanHyperLend }                    from './sources/hyperlend'
import { scanHyperSwap }                    from './sources/hyperswap'
import { scanKinetiq }                      from './sources/kinetiq'
import { scanFelix }                        from './sources/felix'
import { checkHypeS2 }                      from './sources/hype_s2'
import { sendProof, validateProxyConfig }   from './proxy'

const DRY_RUN = process.env.DRY_RUN === 'true'

type SourceResult = PromiseSettledResult<ProofRow[]>

function collect(pairs: [string, SourceResult][]): { proofs: ProofRow[]; errors: string[] } {
  const proofs: ProofRow[] = []
  const errors: string[]   = []
  for (const [name, result] of pairs) {
    if (result.status === 'fulfilled') {
      proofs.push(...result.value)
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      errors.push(`${name}: ${msg}`)
      log.error(`${name} source threw: ${msg}`)
    }
  }
  return { proofs, errors }
}

async function scanWallet(raw: string): Promise<WalletScanResult> {
  const wallet = validateAndNormalize(raw)
  if (!wallet) {
    return { wallet: raw, proofs: [], errors: [], skipped: true, reason: 'invalid address format' }
  }

  const results = await Promise.allSettled([
    checkHyperliquid(wallet),
    scanHyperLend(wallet),
    scanHyperSwap(wallet),
    scanKinetiq(wallet),
    scanFelix(wallet),
    checkHypeS2(wallet),
  ])

  const { proofs, errors } = collect([
    ['Hyperliquid', results[0]],
    ['HyperLend',   results[1]],
    ['HyperSwap',   results[2]],
    ['Kinetiq',     results[3]],
    ['Felix',       results[4]],
    ['HYPE S2',     results[5]],
  ])

  return { wallet, proofs, errors, skipped: false }
}

function logSkippedIntegrations(): void {
  log.info('HyperLend:  [PAUSED] points season ended 2025-10-22 — scanner active, no new rewards')
  log.info('HyperSwap:  SKIPPED — no verified public indexer/pool list')
}

export async function runProofWorker(): Promise<ScanStats> {
  const startedAt = new Date()
  const hlApi     = process.env.HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz'
  const evmRpc    = process.env.HYPEREVM_RPC_URL    ?? 'https://rpc.hyperliquid.xyz/evm'

  log.info(`Starting proof worker | dry_run=${DRY_RUN} | hl_api=${hlApi} | evm_rpc=${evmRpc}`)

  logSkippedIntegrations()

  if (!DRY_RUN) validateProxyConfig()

  const rawWallets = await loadMemberWallets()
  log.info(`Loaded ${rawWallets.length} wallet(s) from HYPE_WALLETS`)

  const stats: ScanStats = {
    walletsLoaded:  rawWallets.length,
    walletsScanned: 0,
    walletsSkipped: 0,
    proofsFound:    0,
    proxyAttempted: 0,
    proxySucceeded: 0,
    proxyFailed:    0,
    errors:         0,
    dryRun:         DRY_RUN,
    startedAt,
  }

  for (let i = 0; i < rawWallets.length; i++) {
    const raw = rawWallets[i]
    log.info(`Scanning wallet ${i + 1}/${rawWallets.length}: ${raw}`)

    const result = await scanWallet(raw)

    if (result.skipped) {
      log.warn(`Skipping ${raw}: ${result.reason}`)
      stats.walletsSkipped++
      continue
    }

    stats.walletsScanned++
    stats.proofsFound += result.proofs.length
    stats.errors      += result.errors.length

    for (const err of result.errors) log.error(err)

    for (const proof of result.proofs) {
      log.proof(
        proof.wallet,
        proof.project,
        proof.requirement_key,
        proof.value_usd  != null ? `val=$${proof.value_usd.toFixed(2)}`  :
        proof.value_text != null ? `val=${proof.value_text}` : '',
      )
    }

    if (result.proofs.length > 0) {
      if (DRY_RUN) {
        for (const proof of result.proofs) {
          log.dry(`WOULD SEND | wallet=${proof.wallet} project=${proof.project} key=${proof.requirement_key}`)
        }
      } else {
        for (const proof of result.proofs) {
          stats.proxyAttempted++
          try {
            await sendProof(proof)
            stats.proxySucceeded++
          } catch (err) {
            stats.proxyFailed++
            stats.errors++
            log.error(`Proxy send failed: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    }

    if (i < rawWallets.length - 1) await sleep(300)
  }

  stats.finishedAt = new Date()
  return stats
}
