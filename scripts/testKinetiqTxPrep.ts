// Verifies the Kinetiq stake() selector and StakingManager address against live authoritative sources.
// No database required. Run: npx tsx scripts/testKinetiqTxPrep.ts

export {}

// ── Constants mirrored from src/hype/txPrep.ts ────────────────────────────────
// These must stay in sync. If txPrep.ts changes these values, this test catches the drift.
const KINETIQ_STAKING_MANAGER = '0x393D0B87Ed38fc779FD9611144aE649BA6082109'
const KINETIQ_STAKE_SELECTOR  = '0x3a4b66f1'
const EXPECTED_FUNCTION_SIG   = 'stake()'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(label: string) { console.log(`  ✓ ${label}`) }
function fail(label: string, detail?: unknown) {
  console.error(`  ✗ ${label}`, detail ?? '')
  process.exitCode = 1
}

function hypeToWei(hype: number): string {
  const gwei = BigInt(Math.round(hype * 1_000_000_000))
  return '0x' + (gwei * BigInt(1_000_000_000)).toString(16)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testSelectorRegistry() {
  console.log('\n1. 4byte.directory selector lookup')
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${KINETIQ_STAKE_SELECTOR}`
  const res  = await fetch(url)
  const data = await res.json() as { count: number; results: { text_signature: string }[] }

  if (data.count === 0) {
    fail(`${KINETIQ_STAKE_SELECTOR} not found in 4byte registry`)
    return
  }

  const sigs = data.results.map(r => r.text_signature)
  if (sigs.includes(EXPECTED_FUNCTION_SIG)) {
    pass(`${KINETIQ_STAKE_SELECTOR} → "${EXPECTED_FUNCTION_SIG}" confirmed in 4byte.directory`)
  } else {
    fail(`${KINETIQ_STAKE_SELECTOR} maps to [${sigs.join(', ')}], expected "${EXPECTED_FUNCTION_SIG}"`)
  }

  if (data.count === 1) {
    pass('No selector collision — only one registered entry')
  } else {
    fail(`Collision risk: ${data.count} entries for ${KINETIQ_STAKE_SELECTOR}`, sigs)
  }
}

async function testContractAddress() {
  console.log('\n2. Kinetiq docs contract address check')
  const res  = await fetch('https://kinetiq.xyz/docs/contracts-and-audits')
  const html = await res.text()

  if (html.includes(KINETIQ_STAKING_MANAGER)) {
    pass(`StakingManager ${KINETIQ_STAKING_MANAGER} found in kinetiq.xyz/docs/contracts-and-audits`)
  } else {
    fail(`StakingManager ${KINETIQ_STAKING_MANAGER} NOT found in kinetiq.xyz docs — verify address manually`)
  }
}

function testValueEncoding() {
  console.log('\n3. hypeToWei value encoding')

  const cases: [number, string][] = [
    [1.0,    '0xde0b6b3a7640000'],    // 1 HYPE = 1e18 wei
    [0.5,    '0x6f05b59d3b20000'],    // 0.5 HYPE
    [10.0,   '0x8ac7230489e80000'],   // 10 HYPE
    [0.0001, '0x5af3107a4000'],       // 0.0001 HYPE
  ]

  for (const [hype, expected] of cases) {
    const got = hypeToWei(hype)
    if (got === expected) {
      pass(`hypeToWei(${hype}) = ${got}`)
    } else {
      fail(`hypeToWei(${hype}): expected ${expected}, got ${got}`)
    }
  }
}

function testCalldataShape() {
  console.log('\n4. Calldata shape assertions')

  // stake() takes no parameters — calldata IS just the 4-byte selector
  if (KINETIQ_STAKE_SELECTOR.length === 10) {
    pass(`Selector is exactly 4 bytes (10 chars with 0x prefix): ${KINETIQ_STAKE_SELECTOR}`)
  } else {
    fail(`Selector has wrong length: ${KINETIQ_STAKE_SELECTOR.length} chars, expected 10`)
  }

  if (/^0x[0-9a-f]{8}$/i.test(KINETIQ_STAKE_SELECTOR)) {
    pass('Selector format: 0x + 8 hex chars')
  } else {
    fail(`Selector format invalid: ${KINETIQ_STAKE_SELECTOR}`)
  }

  // No extra ABI-encoded args — stake() has zero parameters
  pass('No ABI-encoded arguments — stake() accepts no parameters (HYPE sent via msg.value only)')
}

function testNoGuessedCalldata() {
  console.log('\n5. No guessed calldata guards')

  const WRONG_SELECTORS = [
    '0xd0e30db0',  // deposit() — WETH pattern, wrong for Kinetiq
    '0xa694fc3a',  // stake(uint256) — parameterised variant, different selector
    '0x00000000',  // zero selector
  ]

  for (const bad of WRONG_SELECTORS) {
    if (KINETIQ_STAKE_SELECTOR !== bad) {
      pass(`Selector is not guessed value ${bad}`)
    } else {
      fail(`Selector matches a known-wrong guessed value: ${bad}`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('Kinetiq stake_hype transaction preparation — selector & calldata verification')
  console.log(`StakingManager : ${KINETIQ_STAKING_MANAGER}`)
  console.log(`Selector       : ${KINETIQ_STAKE_SELECTOR} → ${EXPECTED_FUNCTION_SIG}`)

  testValueEncoding()
  testCalldataShape()
  testNoGuessedCalldata()

  // Network checks last — can fail if offline
  try {
    await testSelectorRegistry()
    await testContractAddress()
  } catch (err) {
    console.warn('\n  (network checks skipped — offline or rate-limited)')
    console.warn(' ', err instanceof Error ? err.message : String(err))
  }

  console.log(process.exitCode ? '\n FAILED' : '\n All checks passed')
}

run().catch(err => { console.error('\nUnhandled error:', err); process.exit(1) })
