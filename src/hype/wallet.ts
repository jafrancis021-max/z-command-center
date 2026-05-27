const HEX_ADDR = /^0x[0-9a-f]{40}$/i

export function isValidWallet(addr: string): boolean {
  return HEX_ADDR.test(addr)
}

export function normalizeWallet(addr: string): string {
  return addr.trim().toLowerCase()
}

export function validateAndNormalize(addr: string): string | null {
  const normalized = normalizeWallet(addr)
  return isValidWallet(normalized) ? normalized : null
}
