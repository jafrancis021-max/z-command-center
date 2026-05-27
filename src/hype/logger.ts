type Level = 'INFO' | 'WARN' | 'ERROR' | 'DRY' | 'PROOF'

function emit(level: Level, msg: string): void {
  const ts = new Date().toISOString()
  process.stdout.write(`${ts} [hype-proofs] ${level.padEnd(5)}  ${msg}\n`)
}

export const log = {
  info:  (msg: string) => emit('INFO',  msg),
  warn:  (msg: string) => emit('WARN',  msg),
  error: (msg: string) => emit('ERROR', msg),
  dry:   (msg: string) => emit('DRY',   msg),
  proof: (wallet: string, project: string, key: string, extra = '') =>
    emit('PROOF', `wallet=${wallet} project=${project} key=${key}${extra ? ' ' + extra : ''}`),
}
