// Wallet source for the HYPE proof worker.
// Wallets are configured via HYPE_WALLETS (comma-separated addresses).
// No Supabase service key is required.

export async function loadMemberWallets(): Promise<string[]> {
  const raw = process.env.HYPE_WALLETS ?? ''
  const wallets = raw
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0)
  return wallets
}
