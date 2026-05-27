// Supabase write layer for the HYPE execution intent system.
// Used by CLI jobs only — requires NEXT_PUBLIC_SUPABASE_URL and a valid key.
// Never imported by Next.js API routes (those use src/lib/supabase.ts).

import { createClient } from '@supabase/supabase-js'
import type {
  ExecutionPipeline,
  IntentInsert,
  StepInsert,
  PlanStatus,
  IntentStatus,
  StepStatus,
} from './pipeline'

function createHypeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    )
  }
  return createClient(url, key)
}

// ── DB row types (returned by queries) ───────────────────────────────────────

export interface StepRow {
  id:                 string
  intent_id:          string
  step_number:        number
  title:              string
  description:        string
  protocol:           string
  action:             string
  expected_output:    string | null
  risk_note:          string | null
  requires_signature: boolean
  tx_hash:            string | null
  status:             string
  submitted_at:       string | null
  confirmed_at:       string | null
  verified_at:        string | null
  chain_id:           string | null
  tx_status:          string | null
  created_at:         string
  updated_at:         string
}

export interface IntentRow {
  id:                 string
  plan_id:            string
  wallet:             string
  protocol:           string
  action:             string
  usd_amount:         number
  hype_amount:        number | null
  requires_signature: boolean
  execution_order:    number
  status:             string
  approval_status:    string
  approved_at:        string | null
  tx_hash:            string | null
  error_message:      string | null
  submitted_at:       string | null
  confirmed_at:       string | null
  verified_at:        string | null
  chain_id:           string | null
  tx_status:          string | null
  created_at:         string
  updated_at:         string
  steps:              StepRow[]
}

export interface PlanRow {
  id:                 string
  member_wallet:      string
  capital_usd:        number
  risk_profile:       string
  objective:          string
  hype_price_usd:     number
  hype_equivalent:    number
  allocation_json:    unknown[]
  hedge_required:     boolean
  hedge_reason:       string | null
  risk_notes:         string[]
  skipped_protocols:  { protocol: string; reason: string }[]
  status:             string
  approval_status:    string
  approved_at:        string | null
  approved_by_wallet: string | null
  rejection_reason:   string | null
  created_at:         string
  updated_at:         string
}

export interface PlanWithPipeline {
  plan:    PlanRow
  intents: IntentRow[]
}

// ── Persist ───────────────────────────────────────────────────────────────────

export interface PersistedPlan {
  plan_id:    string
  intent_ids: string[]
  step_ids:   string[]
}

export async function persistPlan(pipeline: ExecutionPipeline): Promise<PersistedPlan> {
  const db = createHypeClient()

  const { data: planData, error: planErr } = await db
    .from('member_allocation_plans')
    .insert(pipeline.plan)
    .select('id')
    .single()
  if (planErr || !planData) {
    throw new Error(`Failed to insert plan: ${planErr?.message ?? 'no data returned'}`)
  }
  const plan_id = (planData as { id: string }).id

  const intent_ids: string[] = []
  const step_ids:   string[] = []

  for (let i = 0; i < pipeline.intents.length; i++) {
    const intentInsert: IntentInsert = { ...pipeline.intents[i], plan_id }

    const { data: intentData, error: intentErr } = await db
      .from('member_execution_intents')
      .insert(intentInsert)
      .select('id')
      .single()
    if (intentErr || !intentData) {
      throw new Error(`Failed to insert intent[${i}] (${intentInsert.action}): ${intentErr?.message ?? 'no data'}`)
    }
    const intent_id = (intentData as { id: string }).id
    intent_ids.push(intent_id)

    const stepInsert: StepInsert = { ...pipeline.steps[i], intent_id }

    const { data: stepData, error: stepErr } = await db
      .from('member_execution_steps')
      .insert(stepInsert)
      .select('id')
      .single()
    if (stepErr || !stepData) {
      throw new Error(`Failed to insert step[${i}] (${stepInsert.title}): ${stepErr?.message ?? 'no data'}`)
    }
    step_ids.push((stepData as { id: string }).id)
  }

  return { plan_id, intent_ids, step_ids }
}

// ── Approval flow ─────────────────────────────────────────────────────────────

export async function approvePlan(planId: string, wallet: string): Promise<void> {
  const db    = createHypeClient()
  const now   = new Date().toISOString()
  const lower = wallet.toLowerCase()

  // Fetch plan to verify ownership and current state
  const { data: plan, error: fetchErr } = await db
    .from('member_allocation_plans')
    .select('member_wallet, approval_status, status')
    .eq('id', planId)
    .single()

  if (fetchErr || !plan) throw new Error(`Plan not found: ${planId}`)

  const p = plan as { member_wallet: string; approval_status: string; status: string }

  if (p.member_wallet.toLowerCase() !== lower) {
    throw new Error(
      `Wallet mismatch — plan belongs to ${p.member_wallet}, cannot be approved by ${wallet}`,
    )
  }
  if (p.approval_status !== 'pending') {
    throw new Error(`Plan is already ${p.approval_status} — cannot approve`)
  }
  if (p.status === 'cancelled' || p.status === 'rejected') {
    throw new Error(`Plan status is ${p.status} — cannot approve`)
  }

  // Approve the plan
  const { error: planErr } = await db
    .from('member_allocation_plans')
    .update({
      approval_status:    'approved',
      approved_at:        now,
      approved_by_wallet: lower,
      status:             'approved',
    })
    .eq('id', planId)
  if (planErr) throw new Error(`Failed to approve plan: ${planErr.message}`)

  // Move all non-skipped intents: planned → awaiting_signature, approval_status → approved
  const { error: activeErr } = await db
    .from('member_execution_intents')
    .update({
      status:          'awaiting_signature',
      approval_status: 'approved',
      approved_at:     now,
    })
    .eq('plan_id', planId)
    .neq('status', 'skipped')
  if (activeErr) throw new Error(`Failed to advance intents: ${activeErr.message}`)

  // Mark skipped intents with approval_status='skipped' — they remain status='skipped'
  const { error: skippedErr } = await db
    .from('member_execution_intents')
    .update({ approval_status: 'skipped' })
    .eq('plan_id', planId)
    .eq('status', 'skipped')
  if (skippedErr) throw new Error(`Failed to mark skipped intents: ${skippedErr.message}`)
}

export async function rejectPlan(planId: string, wallet: string, reason: string): Promise<void> {
  const db    = createHypeClient()
  const lower = wallet.toLowerCase()

  const { data: plan, error: fetchErr } = await db
    .from('member_allocation_plans')
    .select('member_wallet, approval_status')
    .eq('id', planId)
    .single()

  if (fetchErr || !plan) throw new Error(`Plan not found: ${planId}`)

  const p = plan as { member_wallet: string; approval_status: string }

  if (p.member_wallet.toLowerCase() !== lower) {
    throw new Error(
      `Wallet mismatch — plan belongs to ${p.member_wallet}, cannot be rejected by ${wallet}`,
    )
  }
  if (p.approval_status !== 'pending') {
    throw new Error(`Plan is already ${p.approval_status} — cannot reject`)
  }

  // Reject the plan — intents are NOT advanced (status unchanged)
  const { error: planErr } = await db
    .from('member_allocation_plans')
    .update({
      approval_status:  'rejected',
      status:           'rejected',
      rejection_reason: reason || null,
    })
    .eq('id', planId)
  if (planErr) throw new Error(`Failed to reject plan: ${planErr.message}`)

  // Mark all intents as approval_status='rejected' — execution status unchanged
  const { error: intentsErr } = await db
    .from('member_execution_intents')
    .update({ approval_status: 'rejected' })
    .eq('plan_id', planId)
  if (intentsErr) throw new Error(`Failed to mark intents rejected: ${intentsErr.message}`)
}

export async function markPlanExpired(planId: string): Promise<void> {
  const db = createHypeClient()

  // Only expire plans that are still pending — do not touch already-decided plans
  const { error } = await db
    .from('member_allocation_plans')
    .update({
      approval_status: 'expired',
      status:          'cancelled',
    })
    .eq('id', planId)
    .eq('approval_status', 'pending')
  if (error) throw new Error(`markPlanExpired(${planId}): ${error.message}`)
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getPlanWithPipeline(planId: string): Promise<PlanWithPipeline> {
  const db = createHypeClient()

  const { data: plan, error: planErr } = await db
    .from('member_allocation_plans')
    .select('*')
    .eq('id', planId)
    .single()
  if (planErr || !plan) throw new Error(`Plan not found: ${planId}`)

  const { data: intents, error: intentsErr } = await db
    .from('member_execution_intents')
    .select('*')
    .eq('plan_id', planId)
    .order('execution_order', { ascending: true })
  if (intentsErr) throw new Error(`Failed to fetch intents: ${intentsErr.message}`)

  const intentRows = (intents ?? []) as Omit<IntentRow, 'steps'>[]

  // Batch-fetch all steps for this plan's intents
  const intentIds = intentRows.map(i => i.id)
  const { data: steps, error: stepsErr } = intentIds.length > 0
    ? await db
        .from('member_execution_steps')
        .select('*')
        .in('intent_id', intentIds)
        .order('step_number', { ascending: true })
    : { data: [], error: null }
  if (stepsErr) throw new Error(`Failed to fetch steps: ${stepsErr.message}`)

  // Group steps by intent_id
  const stepsByIntent = new Map<string, StepRow[]>()
  for (const step of steps ?? []) {
    const s = step as StepRow
    const bucket = stepsByIntent.get(s.intent_id) ?? []
    bucket.push(s)
    stepsByIntent.set(s.intent_id, bucket)
  }

  return {
    plan: plan as PlanRow,
    intents: intentRows.map(i => ({
      ...i,
      steps: stepsByIntent.get(i.id) ?? [],
    })) as IntentRow[],
  }
}

export async function getLatestPlanByWallet(wallet: string): Promise<PlanRow | null> {
  const db = createHypeClient()
  const { data, error } = await db
    .from('member_allocation_plans')
    .select('*')
    .eq('member_wallet', wallet.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`getLatestPlanByWallet: ${error.message}`)
  if (!data || data.length === 0) return null
  return data[0] as PlanRow
}

export async function getPlansByWallet(
  wallet: string,
): Promise<{ id: string; status: string; approval_status: string; created_at: string }[]> {
  const db = createHypeClient()
  const { data, error } = await db
    .from('member_allocation_plans')
    .select('id, status, approval_status, created_at, capital_usd, risk_profile, objective, hype_price_usd')
    .eq('member_wallet', wallet.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getPlansByWallet: ${error.message}`)
  return (data ?? []) as { id: string; status: string; approval_status: string; created_at: string }[]
}

// ── Status transitions (lower-level, for future executor use) ─────────────────

export async function markPlanSuperseded(planId: string): Promise<void> {
  const db = createHypeClient()
  // Only move non-terminal plans — completed/verified plans are left as-is.
  const { error } = await db
    .from('member_allocation_plans')
    .update({ status: 'superseded' })
    .eq('id', planId)
    .not('status', 'in', '(completed,cancelled,rejected,superseded)')
  if (error) throw new Error(`markPlanSuperseded(${planId}): ${error.message}`)
}

export async function updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
  const db = createHypeClient()
  const { error } = await db
    .from('member_allocation_plans')
    .update({ status })
    .eq('id', planId)
  if (error) throw new Error(`updatePlanStatus(${planId}): ${error.message}`)
}

export async function updateIntentStatus(
  intentId: string,
  status:   IntentStatus,
  opts: { tx_hash?: string; error_message?: string } = {},
): Promise<void> {
  const db = createHypeClient()
  const { error } = await db
    .from('member_execution_intents')
    .update({ status, ...opts })
    .eq('id', intentId)
  if (error) throw new Error(`updateIntentStatus(${intentId}): ${error.message}`)
}

export async function updateStepStatus(
  stepId: string,
  status: StepStatus,
  opts: { tx_hash?: string } = {},
): Promise<void> {
  const db = createHypeClient()
  const { error } = await db
    .from('member_execution_steps')
    .update({ status, ...opts })
    .eq('id', stepId)
  if (error) throw new Error(`updateStepStatus(${stepId}): ${error.message}`)
}

export async function getIntentById(intentId: string): Promise<IntentRow> {
  const db = createHypeClient()

  const { data: intent, error: intentErr } = await db
    .from('member_execution_intents')
    .select('*')
    .eq('id', intentId)
    .single()
  if (intentErr || !intent) throw new Error(`Intent not found: ${intentId}`)

  const { data: steps, error: stepsErr } = await db
    .from('member_execution_steps')
    .select('*')
    .eq('intent_id', intentId)
    .order('step_number', { ascending: true })
  if (stepsErr) throw new Error(`Failed to fetch steps for intent ${intentId}: ${stepsErr.message}`)

  return {
    ...(intent as Omit<IntentRow, 'steps'>),
    steps: (steps ?? []) as StepRow[],
  }
}

export async function getIntentsByPlan(
  planId: string,
): Promise<{ id: string; action: string; status: string; approval_status: string; execution_order: number }[]> {
  const db = createHypeClient()
  const { data, error } = await db
    .from('member_execution_intents')
    .select('id, protocol, action, status, approval_status, execution_order, usd_amount, hype_amount, requires_signature, tx_hash')
    .eq('plan_id', planId)
    .order('execution_order', { ascending: true })
  if (error) throw new Error(`getIntentsByPlan: ${error.message}`)
  return (data ?? []) as { id: string; action: string; status: string; approval_status: string; execution_order: number }[]
}

// ── Tx submission tracking ────────────────────────────────────────────────────

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

export async function submitIntentTx(
  intentId: string,
  wallet:   string,
  txHash:   string,
  chainId:  string,
): Promise<IntentRow> {
  if (!TX_HASH_RE.test(txHash)) {
    throw new Error('Invalid tx_hash format (expected 0x + 64 hex chars)')
  }

  const db    = createHypeClient()
  const now   = new Date().toISOString()
  const lower = wallet.toLowerCase()

  const intent = await getIntentById(intentId)

  if (intent.wallet.toLowerCase() !== lower) {
    throw new Error(`Wallet mismatch — intent belongs to ${intent.wallet}`)
  }
  if (intent.status !== 'awaiting_signature' && intent.status !== 'ready') {
    throw new Error(`Intent status is '${intent.status}' — only awaiting_signature or ready intents can be submitted`)
  }

  const { error: intentErr } = await db
    .from('member_execution_intents')
    .update({ status: 'submitted', tx_hash: txHash, submitted_at: now, tx_status: 'pending', chain_id: chainId })
    .eq('id', intentId)
  if (intentErr) throw new Error(`submitIntentTx: ${intentErr.message}`)

  const { error: stepErr } = await db
    .from('member_execution_steps')
    .update({ status: 'submitted', tx_hash: txHash, submitted_at: now, tx_status: 'pending', chain_id: chainId })
    .eq('intent_id', intentId)
  if (stepErr) throw new Error(`submitIntentTx step: ${stepErr.message}`)

  return getIntentById(intentId)
}

export async function confirmIntentTx(
  intentId:    string,
  txHash:      string,
  blockNumber: number,
): Promise<void> {
  const db  = createHypeClient()
  const now = new Date().toISOString()

  const intent = await getIntentById(intentId)
  if (intent.tx_hash?.toLowerCase() !== txHash.toLowerCase()) {
    throw new Error(`tx_hash mismatch — submitted ${intent.tx_hash}, receipt has ${txHash}`)
  }
  if (intent.status !== 'submitted') {
    throw new Error(`Intent status is '${intent.status}' — expected submitted (block ${blockNumber})`)
  }

  const { error: intentErr } = await db
    .from('member_execution_intents')
    .update({ status: 'confirmed', confirmed_at: now, tx_status: 'confirmed' })
    .eq('id', intentId)
  if (intentErr) throw new Error(`confirmIntentTx: ${intentErr.message}`)

  const { error: stepErr } = await db
    .from('member_execution_steps')
    .update({ status: 'confirmed', confirmed_at: now, tx_status: 'confirmed' })
    .eq('intent_id', intentId)
  if (stepErr) throw new Error(`confirmIntentTx step: ${stepErr.message}`)
}

export async function failIntentTx(
  intentId: string,
  txHash:   string,
  reason:   string,
): Promise<void> {
  const db = createHypeClient()

  const { error: intentErr } = await db
    .from('member_execution_intents')
    .update({ status: 'failed', tx_status: 'failed', error_message: reason })
    .eq('id', intentId)
    .eq('tx_hash', txHash)
  if (intentErr) throw new Error(`failIntentTx: ${intentErr.message}`)

  const { error: stepErr } = await db
    .from('member_execution_steps')
    .update({ status: 'failed', tx_status: 'failed' })
    .eq('intent_id', intentId)
  if (stepErr) throw new Error(`failIntentTx step: ${stepErr.message}`)
}

export async function markIntentVerified(intentId: string): Promise<void> {
  const db  = createHypeClient()
  const now = new Date().toISOString()

  const { error: intentErr } = await db
    .from('member_execution_intents')
    .update({ status: 'verified', verified_at: now })
    .eq('id', intentId)
  if (intentErr) throw new Error(`markIntentVerified: ${intentErr.message}`)

  const { error: stepErr } = await db
    .from('member_execution_steps')
    .update({ status: 'verified', verified_at: now })
    .eq('intent_id', intentId)
  if (stepErr) throw new Error(`markIntentVerified step: ${stepErr.message}`)
}

export interface SubmittedIntent {
  id:       string
  tx_hash:  string
  chain_id: string
  protocol: string
  action:   string
  wallet:   string
}

export async function getSubmittedIntents(): Promise<SubmittedIntent[]> {
  const db = createHypeClient()
  const { data, error } = await db
    .from('member_execution_intents')
    .select('id, tx_hash, chain_id, protocol, action, wallet')
    .eq('status', 'submitted')
    .eq('tx_status', 'pending')
  if (error) throw new Error(`getSubmittedIntents: ${error.message}`)
  return (data ?? []) as SubmittedIntent[]
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export type NextAction =
  | 'create_plan'
  | 'approve_or_reject_plan'
  | 'member_signature_required'
  | 'review_failed_step'
  | 'complete'
  | 'monitor_execution'
  | 'regenerate_plan'

export interface ProgressSummary {
  total_intents:            number
  planned_count:            number
  awaiting_signature_count: number
  ready_count:              number
  submitted_count:          number
  confirmed_count:          number
  verified_count:           number
  failed_count:             number
  skipped_count:            number
  completion_pct:           number  // (confirmed+verified) / (total-skipped) * 100
  next_action:              NextAction
}

export interface ExecutionDashboard {
  plan:     PlanRow | null
  progress: ProgressSummary
  intents:  IntentRow[]   // each IntentRow includes steps: StepRow[]
}

function buildProgress(plan: PlanRow | null, intents: IntentRow[]): ProgressSummary {
  if (!plan) {
    return {
      total_intents: 0, planned_count: 0, awaiting_signature_count: 0,
      ready_count: 0, submitted_count: 0, confirmed_count: 0,
      verified_count: 0, failed_count: 0, skipped_count: 0,
      completion_pct: 0,
      next_action: 'create_plan',
    }
  }

  let planned = 0, awaiting = 0, ready = 0, submitted = 0
  let confirmed = 0, verified = 0, failed = 0, skipped = 0

  for (const intent of intents) {
    switch (intent.status) {
      case 'planned':            planned++;   break
      case 'awaiting_signature': awaiting++;  break
      case 'ready':              ready++;     break
      case 'submitted':          submitted++; break
      case 'confirmed':          confirmed++; break
      case 'verified':           verified++;  break
      case 'failed':             failed++;    break
      case 'skipped':            skipped++;   break
    }
  }

  const total  = intents.length
  const active = total - skipped                            // skipped excluded from denominator
  const done   = confirmed + verified
  const completion_pct = active > 0 ? Math.round((done / active) * 100) : 0

  let next_action: NextAction
  if (plan.approval_status === 'pending') {
    next_action = 'approve_or_reject_plan'
  } else if (awaiting > 0) {
    next_action = 'member_signature_required'
  } else if (failed > 0) {
    next_action = 'review_failed_step'
  } else if (active > 0 && verified === active) {
    next_action = 'complete'
  } else {
    next_action = 'monitor_execution'
  }

  return {
    total_intents:            total,
    planned_count:            planned,
    awaiting_signature_count: awaiting,
    ready_count:              ready,
    submitted_count:          submitted,
    confirmed_count:          confirmed,
    verified_count:           verified,
    failed_count:             failed,
    skipped_count:            skipped,
    completion_pct,
    next_action,
  }
}

export async function getExecutionDashboardByPlan(planId: string): Promise<ExecutionDashboard> {
  const { plan, intents } = await getPlanWithPipeline(planId)
  return {
    plan,
    progress: buildProgress(plan, intents),
    intents,
  }
}

export async function getExecutionDashboardByWallet(wallet: string): Promise<ExecutionDashboard> {
  const db    = createHypeClient()
  const lower = wallet.toLowerCase()

  // Latest plan for this wallet (chronological — most recently created)
  const { data, error } = await db
    .from('member_allocation_plans')
    .select('id')
    .eq('member_wallet', lower)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`getExecutionDashboardByWallet: ${error.message}`)

  if (!data || data.length === 0) {
    return {
      plan:     null,
      progress: buildProgress(null, []),
      intents:  [],
    }
  }

  return getExecutionDashboardByPlan((data[0] as { id: string }).id)
}
