import type { ProofRow } from './types'
import { withRetry }    from './retry'

function getProxyUrl(): string {
  const url = process.env.HYPE_PROXY_URL
  if (!url) throw new Error('HYPE_PROXY_URL is not set — add it to .env.local')
  return url.replace(/\/$/, '')
}

function getWorkerSecret(): string {
  const secret = process.env.HYPE_WORKER_SECRET
  if (!secret) throw new Error('HYPE_WORKER_SECRET is not set — add it to .env.local')
  return secret
}

export function validateProxyConfig(): void {
  getProxyUrl()
  getWorkerSecret()
}

async function sendOnce(proof: ProofRow): Promise<void> {
  const res = await fetch(getProxyUrl(), {
    method:  'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-hype-worker-secret': getWorkerSecret(),
    },
    body: JSON.stringify({
      wallet:          proof.wallet,
      project:         proof.project,
      requirement_key: proof.requirement_key,
      value_usd:       proof.value_usd    ?? null,
      value_text:      proof.value_text   ?? null,
      tx_hash:         proof.tx_hash      ?? null,
      block_number:    proof.block_number ?? null,
      proven_at:       proof.proven_at,
      status:          'proven',
      notes:           proof.notes ?? null,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`proxy HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  type ProxyResponse = { ok: boolean; error?: string }
  const json: ProxyResponse = await res.json().catch(
    () => ({ ok: false, error: 'non-JSON response' }),
  )
  if (!json.ok) {
    throw new Error(`proxy ok:false — ${json.error ?? 'no detail'}`)
  }
}

export async function sendProof(proof: ProofRow): Promise<void> {
  return withRetry(
    () => sendOnce(proof),
    `proxy ${proof.wallet}/${proof.project}/${proof.requirement_key}`,
  )
}
