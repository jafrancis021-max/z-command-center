/**
 * src/jobs/approveAllocationPlan.ts — HYPE allocation plan approval / rejection CLI.
 *
 * Approve:
 *   PLAN_ID=<uuid>  PLAN_WALLET=0x...  PLAN_APPROVAL_ACTION=approve  npm run hype:approve-plan
 *
 * Reject:
 *   PLAN_ID=<uuid>  PLAN_WALLET=0x...  PLAN_APPROVAL_ACTION=reject  PLAN_REJECTION_REASON="Not ready"  npm run hype:approve-plan
 *
 * Safety:
 *   - Only the wallet that owns the plan can approve or reject it.
 *   - No transactions are executed.
 *   - No protocol calls are made.
 *   - Approval only changes DB statuses.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'

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
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
      if (key && !(key in process.env)) process.env[key] = val
    }
    return
  }
}

loadEnvFile()

import { approvePlan, rejectPlan, getPlanWithPipeline } from '../hype/db'
import type { IntentRow } from '../hype/db'

function sep(char = '─', width = 70): string { return char.repeat(width) }

function intentLine(intent: IntentRow): string {
  const order  = String(intent.execution_order).padStart(2)
  const action = intent.action.padEnd(42)
  const status = intent.status.padEnd(22)
  const approv = intent.approval_status
  return `  [${order}]  ${action}  status=${status}  approval=${approv}`
}

function logTransition(label: string, from: string, to: string): void {
  console.log(`  ${label.padEnd(40)}  ${from} → ${to}`)
}

async function main(): Promise<void> {
  const planId  = process.env.PLAN_ID
  const wallet  = process.env.PLAN_WALLET
  const action  = process.env.PLAN_APPROVAL_ACTION as 'approve' | 'reject' | undefined
  const reason  = process.env.PLAN_REJECTION_REASON ?? ''

  const errs: string[] = []
  if (!planId)  errs.push('PLAN_ID is required')
  if (!wallet)  errs.push('PLAN_WALLET is required')
  if (!action)  errs.push('PLAN_APPROVAL_ACTION is required  (approve | reject)')
  if (action && !['approve', 'reject'].includes(action)) {
    errs.push('PLAN_APPROVAL_ACTION must be "approve" or "reject"')
  }
  if (action === 'reject' && !reason) {
    errs.push('PLAN_REJECTION_REASON is required when rejecting')
  }

  if (errs.length > 0) {
    console.error('Input errors:')
    for (const e of errs) console.error(`  - ${e}`)
    console.error('\nExamples:')
    console.error('  PLAN_ID=<uuid>  PLAN_WALLET=0x...  PLAN_APPROVAL_ACTION=approve  npm run hype:approve-plan')
    console.error('  PLAN_ID=<uuid>  PLAN_WALLET=0x...  PLAN_APPROVAL_ACTION=reject  PLAN_REJECTION_REASON="Not ready"  npm run hype:approve-plan')
    process.exit(1)
  }

  // Snapshot state before the transition for logging
  let beforePlan: { status: string; approval_status: string } | null = null
  let beforeIntents: IntentRow[] = []
  try {
    const before = await getPlanWithPipeline(planId!)
    beforePlan    = { status: before.plan.status, approval_status: before.plan.approval_status }
    beforeIntents = before.intents
  } catch {
    // Plan may not exist — let the action function surface the proper error
  }

  console.log(sep('═'))
  console.log(`HYPE Allocation Plan — ${action!.toUpperCase()}`)
  console.log(sep('═'))
  console.log(`Plan ID:  ${planId}`)
  console.log(`Wallet:   ${wallet}`)
  console.log(`Action:   ${action}`)
  if (reason) console.log(`Reason:   ${reason}`)

  if (beforePlan) {
    console.log(`\nCurrent state:  status=${beforePlan.status}  approval=${beforePlan.approval_status}`)
  }

  console.log('')

  try {
    if (action === 'approve') {
      await approvePlan(planId!, wallet!)
      console.log('Approved.')
    } else {
      await rejectPlan(planId!, wallet!, reason)
      console.log('Rejected.')
    }
  } catch (err) {
    console.error(`\nFatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // Fetch updated state and print transition summary
  const after = await getPlanWithPipeline(planId!)

  console.log(sep())
  console.log('Status transitions')
  console.log(sep())

  if (beforePlan) {
    logTransition(
      'plan.status',
      beforePlan.status,
      after.plan.status,
    )
    logTransition(
      'plan.approval_status',
      beforePlan.approval_status,
      after.plan.approval_status,
    )
  } else {
    console.log(`  plan.status          ${after.plan.status}`)
    console.log(`  plan.approval_status ${after.plan.approval_status}`)
  }

  if (after.plan.approved_at)      console.log(`  plan.approved_at     ${after.plan.approved_at}`)
  if (after.plan.rejection_reason) console.log(`  plan.rejection_reason  "${after.plan.rejection_reason}"`)

  console.log(sep())
  console.log('Intent pipeline')
  console.log(sep())

  for (const intent of after.intents) {
    const before = beforeIntents.find(b => b.id === intent.id)
    const statusChanged = before && (before.status !== intent.status || before.approval_status !== intent.approval_status)
    const marker = statusChanged ? ' ←' : ''
    console.log(intentLine(intent) + marker)
  }

  console.log(sep('═'))

  // Summary counts for approve
  if (action === 'approve') {
    const awaiting = after.intents.filter(i => i.status === 'awaiting_signature').length
    const skipped  = after.intents.filter(i => i.status === 'skipped').length
    console.log(`${awaiting} intent(s) moved to awaiting_signature | ${skipped} skipped`)
  }

  console.log(sep('═'))
}

main()
