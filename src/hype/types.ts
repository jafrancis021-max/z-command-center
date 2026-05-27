export interface ProofRow {
  wallet:          string
  project:         string
  requirement_key: string
  value_usd?:      number | null
  value_text?:     string | null
  tx_hash?:        string | null
  block_number?:   number | null
  proven_at:       string
  status:          'proven'
  notes?:          string | null
}

export interface WalletScanResult {
  wallet:  string
  proofs:  ProofRow[]
  errors:  string[]
  skipped: boolean
  reason?: string
}

export interface ScanStats {
  walletsLoaded:   number
  walletsScanned:  number
  walletsSkipped:  number
  proofsFound:     number
  proxyAttempted:  number
  proxySucceeded:  number
  proxyFailed:     number
  errors:          number
  dryRun:          boolean
  startedAt:       Date
  finishedAt?:     Date
}
