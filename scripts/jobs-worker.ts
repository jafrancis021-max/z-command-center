/**
 * jobs-worker.ts — Z Scheduled Operational Engine worker
 *
 * Usage:
 *   npm run jobs:run-once    — execute all due jobs once then exit
 *   npm run jobs:worker      — poll every CYCLE_SECONDS and repeat
 *
 * Env vars are loaded from .env.local (then .env) automatically.
 * If running directly with tsx, ensure env vars are set in shell or
 * the .env.local file exists at the project root.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'

// ── Env bootstrap — must run before any import uses process.env ───────────────
// (getAdmin() creates the Supabase client lazily inside functions, so loading
//  env here before calling runDueJobs() is sufficient.)

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
      // Strip optional surrounding quotes from value
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
      if (key && !(key in process.env)) process.env[key] = val
    }
    console.log(`[jobs-worker] Loaded env from ${name}`)
    return
  }
  console.log('[jobs-worker] No .env.local / .env found — relying on shell environment')
}

loadEnvFile()

// ── Imports (after env is loaded) ─────────────────────────────────────────────

import { runDueJobs } from '../src/lib/job-executor'

// ── Config ────────────────────────────────────────────────────────────────────

const CYCLE_SECONDS = parseInt(process.env.JOB_CYCLE_SECONDS ?? '60', 10)
const ONCE          = process.argv.includes('--once')

// ── Main ─────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const start = Date.now()
  console.log(`\n[jobs-worker] ─── Tick ${new Date().toISOString()} ───`)
  try {
    const { ran, failed } = await runDueJobs()
    console.log(`[jobs-worker] Tick complete in ${Date.now() - start}ms — ran: ${ran}, failed: ${failed}`)
  } catch (err) {
    console.error('[jobs-worker] Unhandled tick error:', err instanceof Error ? err.message : String(err))
  }
}

async function main(): Promise<void> {
  console.log(`[jobs-worker] ${'═'.repeat(60)}`)
  console.log(`[jobs-worker] Z Scheduled Operational Engine`)
  console.log(`[jobs-worker] Mode: ${ONCE ? 'run-once' : `polling every ${CYCLE_SECONDS}s`}`)
  console.log(`[jobs-worker] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET'}`)
  console.log(`[jobs-worker] Service key:  ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET (using anon key)'}`)
  console.log(`[jobs-worker] ${'═'.repeat(60)}`)

  if (ONCE) {
    await tick()
    process.exit(0)
  }

  // Continuous mode — first tick immediately, then poll
  await tick()
  const timer = setInterval(() => void tick(), CYCLE_SECONDS * 1000)

  process.on('SIGINT',  () => { console.log('\n[jobs-worker] SIGINT — shutting down'); clearInterval(timer); process.exit(0) })
  process.on('SIGTERM', () => { console.log('\n[jobs-worker] SIGTERM — shutting down'); clearInterval(timer); process.exit(0) })
}

main().catch(err => {
  console.error('[jobs-worker] Fatal startup error:', err)
  process.exit(1)
})
