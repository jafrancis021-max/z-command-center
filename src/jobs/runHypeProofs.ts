/**
 * src/jobs/runHypeProofs.ts — HYPE proof worker entry point.
 *
 * Scans configured wallets, detects proof rows, and sends them to the
 * Lovable secure proxy endpoint which writes to public.hype_proofs.
 *
 * Run:
 *   DRY_RUN=true npm run hype:proofs    — log proofs, no proxy calls
 *   npm run hype:proofs                 — live run, sends to proxy
 *
 * Required env vars (.env.local):
 *   HYPE_WALLETS        comma-separated wallet addresses to scan
 *   HYPE_PROXY_URL      Lovable proxy endpoint (required for live run)
 *   HYPE_WORKER_SECRET  shared secret validated by the proxy (required for live run)
 *
 * Optional env vars:
 *   HYPERLIQUID_API_URL     (default: https://api.hyperliquid.xyz)
 *   HYPEREVM_RPC_URL        (default: https://rpc.hyperliquid.xyz/evm)
 *   HYPERLEND_POOL_ADDRESS  (default: 0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b)
 *   KHYPE_TOKEN_CONTRACT    (default: 0xfd739d4e423301ce9385c1fb8850539d657c296d)
 *   DRY_RUN                 (default: false)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'

// ── Env bootstrap — runs before app imports ───────────────────────────────────
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

import { runProofWorker } from '../hype/worker'
import { log }            from '../hype/logger'

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun    = process.env.DRY_RUN === 'true'
  const wallets   = process.env.HYPE_WALLETS ?? ''
  const proxyUrl  = process.env.HYPE_PROXY_URL
  const hasSecret = !!process.env.HYPE_WORKER_SECRET

  log.info('═'.repeat(60))
  log.info('HYPE Proof Worker')
  log.info(`Mode:          ${dryRun ? 'DRY RUN (no proxy calls)' : 'LIVE'}`)
  log.info(`Wallets:       ${wallets ? `${wallets.split(',').filter(w => w.trim()).length} configured` : 'NOT SET — add HYPE_WALLETS to .env.local'}`)
  log.info(`Proxy URL:     ${proxyUrl ?? 'NOT SET (required for live run)'}`)
  log.info(`Worker secret: ${hasSecret ? 'SET' : 'NOT SET (required for live run)'}`)
  log.info(`HL API:        ${process.env.HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz (default)'}`)
  log.info(`EVM RPC:       ${process.env.HYPEREVM_RPC_URL    ?? 'https://rpc.hyperliquid.xyz/evm (default)'}`)
  log.info(`Hyperlend:     [PAUSED — season ended 2025-10-22] ${process.env.HYPERLEND_POOL_ADDRESS ? `POOL ${process.env.HYPERLEND_POOL_ADDRESS}` : 'default pool (0x00A8...)'}`)
  log.info(`Kinetiq:       kHYPE ${(process.env.KHYPE_TOKEN_CONTRACT ?? '0xfd73...').slice(0, 8)}... (kHYPE only)`)
  log.info('═'.repeat(60))

  let exitCode = 0

  try {
    const stats = await runProofWorker()

    const durationSec = stats.finishedAt
      ? ((stats.finishedAt.getTime() - stats.startedAt.getTime()) / 1000).toFixed(1)
      : '?'

    log.info('═'.repeat(60))
    log.info('Run complete')
    log.info(`  Wallets loaded:        ${stats.walletsLoaded}`)
    log.info(`  Wallets scanned:       ${stats.walletsScanned}`)
    log.info(`  Wallets skipped:       ${stats.walletsSkipped}`)
    log.info(`  Proofs found:          ${stats.proofsFound}`)
    log.info(`  Proxy attempted:       ${dryRun ? 'N/A (dry run)' : String(stats.proxyAttempted)}`)
    log.info(`  Proxy succeeded:       ${dryRun ? 'N/A (dry run)' : String(stats.proxySucceeded)}`)
    log.info(`  Proxy failed:          ${dryRun ? 'N/A (dry run)' : String(stats.proxyFailed)}`)
    log.info(`  Errors:                ${stats.errors}`)
    log.info(`  Duration:              ${durationSec}s`)
    log.info('═'.repeat(60))

    if (stats.errors > 0) exitCode = 1
  } catch (err) {
    log.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`)
    exitCode = 1
  }

  process.exit(exitCode)
}

main()
