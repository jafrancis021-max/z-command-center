/**
 * src/jobs/runTxMonitor.ts — one-shot tx receipt monitor.
 *
 * Checks all submitted+pending HyperEVM intents for on-chain receipts.
 * Marks confirmed when receipt.status=0x1, failed when 0x0.
 * Proof verification remains a separate concern (proof worker).
 *
 * No private keys. No signing. No broadcasting. No automatic execution.
 *
 * Run:
 *   npm run hype:monitor-txs
 *
 * Optional env vars:
 *   HYPEREVM_RPC_URL   (default: https://rpc.hyperliquid.xyz/evm)
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

import { checkSubmittedTransactions } from '../hype/txMonitor'
import { log }                         from '../hype/logger'

async function main(): Promise<void> {
  log.info('═══════════════════════════════════════════════')
  log.info('  HYPE Tx Monitor — checking pending receipts')
  log.info('═══════════════════════════════════════════════')

  const result = await checkSubmittedTransactions()

  log.info('─────────────────────────────────────────────')
  log.info(`Checked:   ${result.checked}`)
  log.info(`Confirmed: ${result.confirmed}`)
  log.info(`Failed:    ${result.failed}`)
  log.info(`Pending:   ${result.pending}`)
  log.info('─────────────────────────────────────────────')

  if (result.checked === 0) {
    log.info('No submitted+pending intents found.')
  }
}

main().catch(err => {
  log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
