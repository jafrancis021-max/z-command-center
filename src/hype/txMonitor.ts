// Polls pending submitted intents for on-chain receipts and updates their status.
// Read-only probe — no signing, no broadcasting, no automatic execution.

import { evmRpcUrl }                                      from './evm'
import { getSubmittedIntents, confirmIntentTx, failIntentTx } from './db'
import { log }                                            from './logger'

interface Receipt {
  status:      string   // '0x1' success | '0x0' failed
  blockNumber: string   // hex block number
}

async function getReceipt(txHash: string): Promise<Receipt | null> {
  const res = await fetch(evmRpcUrl(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'eth_getTransactionReceipt',
      params:  [txHash],
      id:      1,
    }),
  })
  if (!res.ok) throw new Error(`EVM RPC → HTTP ${res.status}`)
  const json = await res.json() as { result?: Receipt | null; error?: { message: string } }
  if (json.error) throw new Error(`eth_getTransactionReceipt: ${json.error.message}`)
  return json.result ?? null
}

export interface MonitorResult {
  checked:   number
  confirmed: number
  failed:    number
  pending:   number
}

export async function checkSubmittedTransactions(): Promise<MonitorResult> {
  const intents = await getSubmittedIntents()
  let confirmed = 0, failed = 0, pending = 0

  for (const intent of intents) {
    const tag = intent.id.slice(0, 8)

    if (intent.chain_id !== 'hyperevm') {
      // Only HyperEVM receipts are queryable here — HL L1 and instruction-only txs are not
      log.info(`TxMonitor  ${tag}: chain=${intent.chain_id} — not monitorable (HyperEVM only)`)
      pending++
      continue
    }

    if (!intent.tx_hash) {
      log.warn(`TxMonitor  ${tag}: no tx_hash recorded — skipping`)
      continue
    }

    const shortHash = intent.tx_hash.slice(0, 12) + '...'

    try {
      const receipt = await getReceipt(intent.tx_hash)

      if (!receipt) {
        log.info(`TxMonitor  ${tag}: ${shortHash} — not yet mined`)
        pending++
        continue
      }

      const blockNum = parseInt(receipt.blockNumber, 16)

      if (receipt.status === '0x1') {
        await confirmIntentTx(intent.id, intent.tx_hash, blockNum)
        log.info(`TxMonitor  ${tag}: ${shortHash} — CONFIRMED block=${blockNum} action=${intent.action}`)
        confirmed++
      } else {
        const reason = `Transaction reverted (status=0x0) at block ${blockNum}`
        await failIntentTx(intent.id, intent.tx_hash, reason)
        log.warn(`TxMonitor  ${tag}: ${shortHash} — FAILED block=${blockNum} action=${intent.action}`)
        failed++
      }
    } catch (err) {
      log.warn(`TxMonitor  ${tag}: receipt check error — ${err instanceof Error ? err.message : String(err)}`)
      pending++
    }
  }

  return { checked: intents.length, confirmed, failed, pending }
}
