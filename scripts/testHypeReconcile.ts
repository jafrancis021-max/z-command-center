// Manual integration test for the HYPE reconciliation flow.
// Run: npx tsx scripts/testHypeReconcile.ts [wallet]
// Requires the Next.js dev server on localhost:3000

const BASE = 'http://localhost:3000'

const wallet = process.argv[2] ?? (() => {
  console.error('Usage: npx tsx scripts/testHypeReconcile.ts <wallet_address>')
  process.exit(1)
})()

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  return res.json()
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

function pass(label: string) { console.log(`  ✓ ${label}`) }
function fail(label: string, detail?: unknown) {
  console.error(`  ✗ ${label}`, detail ?? '')
  process.exitCode = 1
}

async function run() {
  console.log(`\nWallet: ${wallet}\n`)

  // ── 1. Reconcile (funded wallet path) ────────────────────────────────────────
  console.log('1. POST /api/hype/reconcile')
  const rec = await post('/api/hype/reconcile', { wallet }) as Record<string, unknown>
  console.log('   response:', JSON.stringify(rec, null, 2).split('\n').slice(0, 20).join('\n'))
  if (rec.ok) {
    pass('reconcile returned ok:true')
    if (rec.wallet_readiness)  pass('wallet_readiness present')
    else                       fail('wallet_readiness missing')
    if (rec.dashboard)         pass('dashboard present')
    else                       fail('dashboard missing')
    if (typeof rec.checked_intents === 'number') pass(`checked_intents: ${rec.checked_intents}`)
    else                                          fail('checked_intents missing or wrong type')
    const changes = rec.changes as unknown[]
    pass(`changes: ${changes.length}`)
  } else {
    fail('reconcile returned ok:false', rec)
  }

  // ── 2. Dashboard after reconcile ─────────────────────────────────────────────
  console.log('\n2. GET /api/hype/execution-dashboard?wallet=...')
  const dash = await get(`/api/hype/execution-dashboard?wallet=${wallet}`) as Record<string, unknown>
  if (dash.ok) {
    pass('dashboard returned ok:true')
    const d = dash.dashboard as Record<string, unknown>
    if (d.wallet_readiness) pass('wallet_readiness in dashboard')
    else                    fail('wallet_readiness missing from dashboard')
    if (d.wallet_snapshot)  pass('wallet_snapshot in dashboard')
    else                    fail('wallet_snapshot missing from dashboard')
    const prog = d.progress as Record<string, unknown>
    if (prog) {
      pass(`next_action: ${prog.next_action}`)
      pass(`completion_pct: ${prog.completion_pct}%`)
    }
  } else {
    fail('dashboard returned ok:false', dash)
  }

  // ── 3. Reconcile idempotency — second call should produce 0 changes ──────────
  console.log('\n3. POST /api/hype/reconcile (idempotency check)')
  const rec2 = await post('/api/hype/reconcile', { wallet }) as Record<string, unknown>
  if (rec2.ok) {
    const changes2 = rec2.changes as unknown[]
    if (changes2.length === 0) pass('idempotent: 0 new changes on second call')
    else                       fail(`expected 0 changes on second call, got ${changes2.length}`)
  } else {
    fail('second reconcile failed', rec2)
  }

  // ── 4. Invalid wallet rejected ───────────────────────────────────────────────
  console.log('\n4. POST /api/hype/reconcile (invalid wallet)')
  const bad = await post('/api/hype/reconcile', { wallet: 'not-a-wallet' }) as Record<string, unknown>
  if (!bad.ok) pass('invalid wallet correctly rejected')
  else         fail('invalid wallet should have returned ok:false', bad)

  console.log(process.exitCode ? '\n FAILED' : '\n All checks passed')
}

run().catch(err => { console.error('\nUnhandled error:', err); process.exit(1) })
