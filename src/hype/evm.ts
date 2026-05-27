// Shared HyperEVM JSON-RPC utilities used by multiple proof sources.

const DEFAULT_RPC = 'https://rpc.hyperliquid.xyz/evm'

export function evmRpcUrl(): string {
  return (process.env.HYPEREVM_RPC_URL ?? DEFAULT_RPC).replace(/\/$/, '')
}

export function padAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

export function padUint256(n: bigint): string {
  return n.toString(16).padStart(64, '0')
}

export function decodeUint256s(hex: string): bigint[] {
  const clean = hex.replace(/^0x/, '')
  const result: bigint[] = []
  for (let i = 0; i + 64 <= clean.length; i += 64) {
    result.push(BigInt('0x' + clean.slice(i, i + 64)))
  }
  return result
}

export async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(evmRpcUrl(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      jsonrpc: '2.0',
      method:  'eth_call',
      params:  [{ to, data }, 'latest'],
      id:      1,
    }),
  })
  if (!res.ok) throw new Error(`EVM RPC → HTTP ${res.status}`)
  const json = await res.json() as { result?: string; error?: { message: string } }
  if (json.error) throw new Error(`eth_call error: ${json.error.message}`)
  return json.result ?? '0x'
}
