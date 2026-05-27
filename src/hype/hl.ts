// Shared Hyperliquid Info API helpers.
// Imported by hype_s2.ts and any other source that queries the Hyperliquid API.
// hyperliquid.ts still defines its own copy of these helpers to remain untouched.

const DEFAULT_API = 'https://api.hyperliquid.xyz'

export function hlApiUrl(): string {
  return (process.env.HYPERLIQUID_API_URL ?? DEFAULT_API).replace(/\/$/, '')
}

export async function hlPost<T>(
  type:  string,
  user:  string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${hlApiUrl()}/info`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type, user, ...extra }),
  })
  if (!res.ok) throw new Error(`HL API ${type} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// ── Shared response types ──────────────────────────────────────────────────────

export interface HlPerpsState {
  marginSummary:  { accountValue: string; totalNtlPos: string }
  assetPositions: Array<{ position: { coin: string; szi: string } }>
}

export interface HlFill {
  coin:  string
  px:    string
  sz:    string
  time:  number
  hash?: string
}

export interface HlAgent {
  address: string
  name:    string
}
