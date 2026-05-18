import type { SupabaseClient } from '@supabase/supabase-js'
import { emitFeedEvent } from '@/lib/feed'

// ── Internal types ─────────────────────────────────────────────────────────────

interface ChainStep {
  id:                string
  step_order:        number
  step_type:         string
  title:             string
  description:       string | null
  requires_approval: boolean
  config:            Record<string, unknown>
}

interface ChainRun {
  id:                string
  workflow_chain_id: string
  source_type:       string
  source_id:         string
  status:            string
  current_step:      number
  result:            Record<string, unknown>
}

// ── Public API ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findMatchingChain(db: SupabaseClient<any>, trigger_type: string): Promise<string | null> {
  const { data } = await db
    .from('workflow_chains')
    .select('id')
    .eq('trigger_type', trigger_type)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startWorkflowChain(
  db: SupabaseClient<any>,
  opts: { source_type: string; source_id: string; trigger_type: string },
): Promise<string | null> {
  const chainId = await findMatchingChain(db, opts.trigger_type)
  if (!chainId) return null

  const { data: run, error } = await db
    .from('workflow_chain_runs')
    .insert({
      workflow_chain_id: chainId,
      source_type:       opts.source_type,
      source_id:         opts.source_id,
      status:            'pending',
      current_step:      1,
    })
    .select('id')
    .single()

  if (error || !run) return null

  const runId = (run as { id: string }).id
  await executeNextChainStep(db, runId)
  return runId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeNextChainStep(db: SupabaseClient<any>, runId: string): Promise<void> {
  const { data: runRaw, error: runErr } = await db
    .from('workflow_chain_runs')
    .select('id, workflow_chain_id, source_type, source_id, status, current_step, result')
    .eq('id', runId)
    .single()

  if (runErr || !runRaw) return

  const run = runRaw as ChainRun
  if (!['pending', 'running'].includes(run.status)) return

  const { data: stepRaw, error: stepErr } = await db
    .from('workflow_chain_steps')
    .select('id, step_order, step_type, title, description, requires_approval, config')
    .eq('workflow_chain_id', run.workflow_chain_id)
    .eq('step_order', run.current_step)
    .maybeSingle()

  if (stepErr || !stepRaw) {
    // No step at this position — chain is complete
    await db.from('workflow_chain_runs').update({ status: 'completed' }).eq('id', runId)
    return
  }

  const step = stepRaw as ChainStep

  await db.from('workflow_chain_runs').update({ status: 'running' }).eq('id', runId)

  try {
    const stepResult   = await executeStep(db, step, run)
    const updatedResult: Record<string, unknown> = {
      ...(run.result as Record<string, unknown>),
      [`step_${run.current_step}`]: stepResult,
    }

    if (step.requires_approval) {
      // Step has been executed; pause and wait for human to continue
      await db.from('workflow_chain_runs').update({
        status:       'waiting_approval',
        current_step: run.current_step,
        result:       updatedResult,
      }).eq('id', runId)
      return
    }

    // Check if there is a next step
    const { data: nextStepRaw } = await db
      .from('workflow_chain_steps')
      .select('id')
      .eq('workflow_chain_id', run.workflow_chain_id)
      .eq('step_order', run.current_step + 1)
      .maybeSingle()

    if (nextStepRaw) {
      await db.from('workflow_chain_runs').update({
        status:       'running',
        current_step: run.current_step + 1,
        result:       updatedResult,
      }).eq('id', runId)
      // Execute the next step (reads updated current_step from DB)
      await executeNextChainStep(db, runId)
    } else {
      await db.from('workflow_chain_runs').update({
        status: 'completed',
        result: updatedResult,
      }).eq('id', runId)
    }
  } catch (err) {
    await db.from('workflow_chain_runs').update({
      status:        'failed',
      error_message: err instanceof Error ? err.message : String(err),
    }).eq('id', runId)
  }
}

// ── Step implementations ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeStep(
  db:   SupabaseClient<any>,
  step: ChainStep,
  run:  ChainRun,
): Promise<Record<string, unknown>> {
  const cfg = step.config

  switch (step.step_type) {

    case 'emit_feed_event': {
      await emitFeedEvent(db, {
        event_type:   (cfg.event_type as string) ?? 'chain_step',
        title:        step.title,
        description:  step.description ?? undefined,
        severity:     (cfg.severity as 'info' | 'success' | 'warning' | 'critical') ?? 'info',
        source_table: 'workflow_chain_runs',
        source_id:    run.id,
        metadata: {
          run_id:      run.id,
          step_order:  step.step_order,
          source_type: run.source_type,
          source_id:   run.source_id,
        },
      })
      return { emitted: true }
    }

    case 'create_approval': {
      // Idempotent — skip if an approval already exists for this source
      const { data: existing } = await db
        .from('approvals')
        .select('id')
        .eq('entity_type', 'inbox_workflow_suggestion')
        .eq('entity_id', run.source_id)
        .eq('status', 'pending')
        .maybeSingle()

      if (existing) {
        return { approval_id: (existing as { id: string }).id, skipped: true, reason: 'already_exists' }
      }

      const { data: srcRaw } = await db
        .from('inbox_workflow_suggestions')
        .select('title, description, suggestion_type, email_id, project_id, suggested_actions')
        .eq('id', run.source_id)
        .maybeSingle()

      type SuggestionRow = {
        title: string; description: string | null; suggestion_type: string
        email_id: string; project_id: string | null; suggested_actions: unknown[]
      }
      const src    = srcRaw as SuggestionRow | null
      const prefix = (cfg.title_prefix as string) ?? 'Review'
      const title  = src ? `${prefix}: ${src.title}` : `${prefix} — run ${run.id.slice(0, 8)}`

      const { data: approval, error } = await db.from('approvals').insert({
        approval_type: (cfg.approval_type as string) ?? 'inbox_chain',
        title,
        description:   src?.description ?? null,
        payload: {
          run_id:            run.id,
          source_type:       run.source_type,
          source_id:         run.source_id,
          step:              step.step_order,
          email_id:          src?.email_id,
          suggestion_type:   src?.suggestion_type,
          suggested_actions: src?.suggested_actions,
        },
        project_id:    src?.project_id ?? null,
        entity_type:   'workflow_chain_run',
        entity_id:     run.id,
        status:        'pending',
      }).select('id').single()

      if (error) throw new Error(`create_approval failed: ${error.message}`)
      return { approval_id: (approval as { id: string } | null)?.id }
    }

    case 'create_task': {
      const { data: srcRaw } = await db
        .from('inbox_workflow_suggestions')
        .select('title, description, project_id')
        .eq('id', run.source_id)
        .maybeSingle()

      type SuggestionRow = { title: string; description: string | null; project_id: string | null }
      const src       = srcRaw as SuggestionRow | null
      const projectId = src?.project_id ?? null

      if (!projectId) {
        await emitFeedEvent(db, {
          event_type:   'chain_task_skipped',
          title:        'Task skipped — no project linked',
          description:  src?.title ?? undefined,
          severity:     'info',
          source_table: 'workflow_chain_runs',
          source_id:    run.id,
          metadata:     { reason: 'no_project_id', run_id: run.id },
        })
        return { skipped: true, reason: 'no_project_id' }
      }

      const prefix    = (cfg.title_prefix as string) ?? 'Task:'
      const taskTitle = `${prefix} ${src?.title ?? `run ${run.id.slice(0, 8)}`}`

      const { data: task, error } = await db.from('tasks').insert({
        project_id:  projectId,
        title:       taskTitle,
        description: src?.description ?? null,
        status:      'todo',
        priority:    (cfg.priority as string) ?? 'medium',
      }).select('id').single()

      if (error) throw new Error(`create_task failed: ${error.message}`)
      return { task_id: (task as { id: string } | null)?.id }
    }

    case 'escalation_check': {
      const { data: blockersRaw } = await db
        .from('blockers')
        .select('id, title, severity')
        .neq('status', 'resolved')
        .in('severity', ['high', 'critical'])

      type BlockerRow = { id: string; title: string; severity: string }
      const blockers = (blockersRaw as BlockerRow[] | null) ?? []

      if (blockers.length > 0) {
        await emitFeedEvent(db, {
          event_type:   'escalation_triggered',
          title:        `${blockers.length} high-severity blocker${blockers.length > 1 ? 's' : ''} flagged`,
          description:  blockers.map(b => b.title).join(', '),
          severity:     'warning',
          source_table: 'workflow_chain_runs',
          source_id:    run.id,
          metadata:     { blocker_ids: blockers.map(b => b.id), run_id: run.id },
        })
      }
      return { blockers_found: blockers.length }
    }

    case 'draft_checklist_suggestion': {
      await emitFeedEvent(db, {
        event_type:   'draft_checklist_ready',
        title:        `Checklist ready for review: ${step.title}`,
        description:  'A draft checklist has been prepared — please review before actioning.',
        severity:     'info',
        source_table: 'workflow_chain_runs',
        source_id:    run.id,
        metadata: {
          run_id:         run.id,
          checklist_type: (cfg.checklist_type as string) ?? 'generic',
          source_type:    run.source_type,
          source_id:      run.source_id,
          awaiting_human: true,
        },
      })
      return { checklist_emitted: true }
    }

    default:
      return { skipped: true, reason: `unknown_step_type:${step.step_type}` }
  }
}
