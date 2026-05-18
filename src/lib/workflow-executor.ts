import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'
import { fetchRecentEmails, getActiveAccount } from '@/lib/gmail-client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Step helpers ──────────────────────────────────────────────────────────────

type DB = ReturnType<typeof getAdmin>

async function startStep(db: DB, stepId: string): Promise<void> {
  await db.from('workflow_run_steps')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', stepId)
}

async function completeStep(db: DB, stepId: string, output: Record<string, unknown> = {}): Promise<void> {
  await db.from('workflow_run_steps')
    .update({ status: 'completed', output, completed_at: new Date().toISOString() })
    .eq('id', stepId)
}

async function failStep(db: DB, stepId: string, error: string): Promise<void> {
  await db.from('workflow_run_steps')
    .update({ status: 'failed', error, completed_at: new Date().toISOString() })
    .eq('id', stepId)
}

async function skipRemaining(db: DB, stepIds: string[]): Promise<void> {
  if (stepIds.length === 0) return
  await db.from('workflow_run_steps').update({ status: 'skipped' }).in('id', stepIds)
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContextText(project: Record<string, unknown>, data: {
  tasks?: Array<Record<string, unknown>>
  decisions?: Array<Record<string, unknown>>
  blockers?: Array<Record<string, unknown>>
  notes?: Array<Record<string, unknown>>
  handovers?: Array<Record<string, unknown>>
}): string {
  const lines: string[] = [
    `PROJECT: ${project.name} | status=${project.current_status ?? 'unknown'} | phase=${project.current_phase ?? 'unknown'} | risk=${project.risk_level ?? 'unknown'}`,
    `NEXT STEP: ${project.next_step ?? 'not defined'}`,
    `MAIN BLOCKER: ${project.main_blocker ?? 'none'}`,
  ]

  if (data.blockers?.length) {
    lines.push('\nOPEN BLOCKERS:')
    data.blockers.forEach(b => lines.push(`  [${b.severity as string}] ${b.title as string}${b.description ? ': ' + (b.description as string) : ''}`))
  }

  if (data.tasks?.length) {
    lines.push('\nOPEN TASKS (recent 15):')
    data.tasks.slice(0, 15).forEach(t => lines.push(`  [${t.status as string}][${t.priority as string}] ${t.title as string}`))
  }

  if (data.decisions?.length) {
    lines.push('\nRECENT DECISIONS:')
    data.decisions.slice(0, 8).forEach(d => lines.push(`  • ${d.decision as string}`))
  }

  if (data.notes?.length) {
    lines.push('\nRECENT NOTES:')
    data.notes.slice(0, 5).forEach(n => lines.push(`  • ${(n.note as string).slice(0, 200)}`))
  }

  if (data.handovers?.length) {
    lines.push('\nLAST HANDOVER PREVIEW:')
    lines.push(`  ${(data.handovers[0].content as string).slice(0, 400)}`)
  }

  return lines.join('\n')
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) as Record<string, unknown> } catch { return null }
}

// ── Workflow context ──────────────────────────────────────────────────────────

interface StepRecord { id: string; step_index: number; step_name: string }

interface WorkflowCtx {
  runId: string
  project: Record<string, unknown> | null
  db: DB
  steps: StepRecord[]
}

// ── Individual workflow implementations ───────────────────────────────────────

async function runGenerateHandover(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  // Step 0: Collect context
  await startStep(db, steps[0].id)
  const [tasks, decisions, blockers, notes, handovers] = await Promise.all([
    db.from('tasks').select('*').eq('project_id', project.id as string).neq('status', 'done').order('created_at', { ascending: false }).limit(20),
    db.from('decisions').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(10),
    db.from('blockers').select('*').eq('project_id', project.id as string).neq('status', 'resolved'),
    db.from('notes').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(8),
    db.from('handovers').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(2),
  ])
  await completeStep(db, steps[0].id, { context_loaded: true })

  // Step 1: Generate
  await startStep(db, steps[1].id)
  const ctx_text = buildContextText(project, { tasks: tasks.data ?? [], decisions: decisions.data ?? [], blockers: blockers.data ?? [], notes: notes.data ?? [], handovers: handovers.data ?? [] })
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Generate a comprehensive project handover for "${project.name as string}".\n\n${ctx_text}\n\nStructure:\n## PROJECT STATUS\n## WHAT WAS DONE\n## CURRENT BLOCKERS\n## NEXT STEPS\n## ARCHITECTURE RULES TO REMEMBER\n## WARNINGS\n## CLAUDE CODE PROMPT FOR NEXT SESSION\n\nBe specific. Reference actual task titles, decision text, blocker names from the context above.`,
    }],
  })
  const content = res.content[0].type === 'text' ? res.content[0].text : ''
  await completeStep(db, steps[1].id, { length: content.length })

  // Step 2: Save handover
  await startStep(db, steps[2].id)
  const { data: handover } = await db.from('handovers').insert({ project_id: project.id as string, content }).select().single()
  await completeStep(db, steps[2].id, { handover_id: handover?.id })

  // Step 3: Create approval
  await startStep(db, steps[3].id)
  const { data: approval } = await db.from('approvals').insert({
    approval_type: 'handover_review',
    title: `Review handover: ${project.name as string}`,
    description: content.slice(0, 300),
    payload: { handover_id: handover?.id, workflow_run_id: runId, preview: content.slice(0, 600) },
    project_id: project.id as string,
    entity_type: 'handover',
    entity_id: handover?.id ?? null,
  }).select().single()
  await completeStep(db, steps[3].id, { approval_id: approval?.id })

  // Step 4: Log
  await startStep(db, steps[4].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'handover_generated', title: `Handover generated: ${project.name as string}`, description: content.slice(0, 150), severity: 'success', source_table: 'handovers', source_id: handover?.id ?? null, metadata: { workflow_run_id: runId } })
  await logAction({ action_type: 'handover_generated', entity_type: 'handover', entity_id: handover?.id, project_id: project.id as string, summary: `Workflow generated handover for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[4].id, {})

  return { summary: `Handover generated for ${project.name as string}`, handover_id: handover?.id, approval_id: approval?.id, requires_approval: true, content_preview: content.slice(0, 400) }
}

async function runGeneratePrompt(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const [tasks, decisions, blockers, notes] = await Promise.all([
    db.from('tasks').select('*').eq('project_id', project.id as string).neq('status', 'done').order('created_at', { ascending: false }).limit(15),
    db.from('decisions').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(8),
    db.from('blockers').select('*').eq('project_id', project.id as string).neq('status', 'resolved'),
    db.from('notes').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(5),
  ])
  await completeStep(db, steps[0].id, { context_loaded: true })

  await startStep(db, steps[1].id)
  const ctx_text = buildContextText(project, { tasks: tasks.data ?? [], decisions: decisions.data ?? [], blockers: blockers.data ?? [], notes: notes.data ?? [] })
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Generate an immediately actionable Claude Code prompt for ${project.name as string}.\n\n${ctx_text}\n\nThe prompt must:\n- Start with project context (path, stack, current phase)\n- State the exact task to complete\n- Include architecture rules to follow\n- Include what NOT to break\n- Include specific files or functions to touch\n- End with acceptance criteria\n\nMake it copy-pasteable. No fluff.`,
    }],
  })
  const promptContent = res.content[0].type === 'text' ? res.content[0].text : ''
  await completeStep(db, steps[1].id, { length: promptContent.length })

  await startStep(db, steps[2].id)
  const { data: savedPrompt } = await db.from('prompts').insert({ project_id: project.id as string, prompt_type: 'workflow_generated', content: promptContent }).select().single()
  await completeStep(db, steps[2].id, { prompt_id: savedPrompt?.id })

  await startStep(db, steps[3].id)
  const { data: approval } = await db.from('approvals').insert({
    approval_type: 'prompt_review',
    title: `Review generated prompt: ${project.name as string}`,
    description: promptContent.slice(0, 300),
    payload: { prompt_id: savedPrompt?.id, workflow_run_id: runId, preview: promptContent.slice(0, 600) },
    project_id: project.id as string,
    entity_type: 'prompt',
    entity_id: savedPrompt?.id ?? null,
  }).select().single()
  await completeStep(db, steps[3].id, { approval_id: approval?.id })

  await startStep(db, steps[4].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'prompt_generated', title: `Prompt generated: ${project.name as string}`, severity: 'success', source_table: 'prompts', source_id: savedPrompt?.id ?? null, metadata: { workflow_run_id: runId } })
  await logAction({ action_type: 'prompt_generated', entity_type: 'prompt', entity_id: savedPrompt?.id, project_id: project.id as string, summary: `Workflow generated Claude Code prompt for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[4].id, {})

  return { summary: `Claude Code prompt generated for ${project.name as string}`, prompt_id: savedPrompt?.id, approval_id: approval?.id, requires_approval: true, content_preview: promptContent.slice(0, 400) }
}

async function runGenerateWeeklyReport(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [tasks, decisions, blockers, sessions, timeline] = await Promise.all([
    db.from('tasks').select('*').eq('project_id', project.id as string).gte('created_at', sevenDaysAgo),
    db.from('decisions').select('*').eq('project_id', project.id as string).gte('created_at', sevenDaysAgo),
    db.from('blockers').select('*').eq('project_id', project.id as string).gte('created_at', sevenDaysAgo),
    db.from('claude_sessions').select('*').eq('project_id', project.id as string).gte('created_at', sevenDaysAgo),
    db.from('project_timeline_events').select('*').eq('project_id', project.id as string).gte('created_at', sevenDaysAgo).order('created_at', { ascending: true }),
  ])
  await completeStep(db, steps[0].id, { records_loaded: (tasks.data?.length ?? 0) + (decisions.data?.length ?? 0) })

  await startStep(db, steps[1].id)
  const taskLines = (tasks.data ?? []).map(t => `  [${t.status}][${t.priority}] ${t.title}`).join('\n') || '  None'
  const decisionLines = (decisions.data ?? []).map(d => `  • ${d.decision}`).join('\n') || '  None'
  const blockerLines = (blockers.data ?? []).map(b => `  ⚠️ [${b.severity}] ${b.title}`).join('\n') || '  None'
  const sessionLines = (sessions.data ?? []).map(s => `  [${s.status}] ${(s.prompt as string).slice(0, 100)}`).join('\n') || '  None'
  const timelineLines = (timeline.data ?? []).map(e => `  ${e.event_type}: ${e.title}`).join('\n') || '  None'
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Generate a weekly operational report for ${project.name as string}.\n\nProject state: phase=${project.current_phase ?? 'unknown'} | risk=${project.risk_level ?? 'unknown'} | next=${project.next_step ?? 'not set'}\n\nThis week's tasks:\n${taskLines}\n\nDecisions:\n${decisionLines}\n\nBlockers:\n${blockerLines}\n\nClaude sessions:\n${sessionLines}\n\nTimeline:\n${timelineLines}\n\nStructure:\n## WEEK IN REVIEW — ${project.name as string}\n## WHAT HAPPENED\n## SUCCESSES\n## BLOCKERS & FAILURES\n## DECISIONS MADE\n## NEXT WEEK'S PRIORITIES\n## RISKS TO WATCH\n\nBe factual and specific.`,
    }],
  })
  const reportText = res.content[0].type === 'text' ? res.content[0].text : ''
  await completeStep(db, steps[1].id, { length: reportText.length })

  await startStep(db, steps[2].id)
  const { data: report } = await db.from('weekly_reports').insert({ project_id: project.id as string, report_text: reportText }).select().single()
  await db.from('project_timeline_events').insert({ project_id: project.id as string, event_type: 'milestone', title: 'Weekly report generated', description: `Workflow-generated report for week of ${new Date().toDateString()}`, metadata: { report_id: report?.id, workflow_run_id: runId } })
  await completeStep(db, steps[2].id, { report_id: report?.id })

  await startStep(db, steps[3].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'report_generated', title: `Weekly report: ${project.name as string}`, severity: 'success', source_table: 'weekly_reports', source_id: report?.id ?? null, metadata: { workflow_run_id: runId } })
  await logAction({ action_type: 'weekly_report_generated', entity_type: 'weekly_report', entity_id: report?.id, project_id: project.id as string, summary: `Workflow generated weekly report for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[3].id, {})

  return { summary: `Weekly report generated for ${project.name as string}`, report_id: report?.id, requires_approval: false, report_preview: reportText.slice(0, 400) }
}

async function runExtractTasksFromNotes(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const { data: notes } = await db.from('notes').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(20)
  await completeStep(db, steps[0].id, { note_count: notes?.length ?? 0 })

  if (!notes?.length) {
    await skipRemaining(db, steps.slice(1).map(s => s.id))
    return { summary: 'No notes found to extract tasks from', requires_approval: false }
  }

  await startStep(db, steps[1].id)
  const noteText = notes.map((n, i) => `Note ${i + 1}: ${n.note}`).join('\n\n')
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Extract actionable tasks from these project notes for "${project.name as string}".\n\n${noteText}\n\nReturn ONLY valid JSON array:\n[\n  {"title": "...", "description": "...", "priority": "high|medium|low", "source_note_index": 1}\n]\n\nOnly include real, specific tasks that are clearly implied or stated. Do not invent tasks. Limit to 8 most important. Return [] if no clear tasks.`,
    }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : '[]'
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  let proposedTasks: Array<{ title: string; description: string; priority: string }> = []
  if (jsonMatch) {
    try { proposedTasks = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
  }
  await completeStep(db, steps[1].id, { extracted_count: proposedTasks.length })

  await startStep(db, steps[2].id)
  const { data: approval } = await db.from('approvals').insert({
    approval_type: 'task_extraction',
    title: `Review extracted tasks: ${project.name as string} (${proposedTasks.length} proposed)`,
    description: proposedTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n'),
    payload: { proposed_tasks: proposedTasks, workflow_run_id: runId, note_count: notes.length },
    project_id: project.id as string,
    entity_type: 'task_extraction',
    entity_id: null,
  }).select().single()
  await completeStep(db, steps[2].id, { approval_id: approval?.id })

  await startStep(db, steps[3].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'task_extraction', title: `${proposedTasks.length} tasks extracted from notes: ${project.name as string}`, severity: 'warning', metadata: { workflow_run_id: runId, approval_id: approval?.id } })
  await logAction({ action_type: 'task_extraction', project_id: project.id as string, summary: `Extracted ${proposedTasks.length} proposed tasks from ${notes.length} notes (pending approval)`, status: 'completed' })
  await completeStep(db, steps[3].id, {})

  return { summary: `${proposedTasks.length} tasks extracted, pending approval`, proposed_tasks: proposedTasks, approval_id: approval?.id, requires_approval: true }
}

async function runSummarizeMemory(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const { data: memories } = await db.from('project_memories').select('*').eq('project_id', project.id as string).eq('ingestion_status', 'complete').order('created_at', { ascending: false })
  await completeStep(db, steps[0].id, { memory_count: memories?.length ?? 0 })

  if (!memories?.length) {
    await skipRemaining(db, steps.slice(1).map(s => s.id))
    return { summary: 'No completed memories found to summarize', requires_approval: false }
  }

  await startStep(db, steps[1].id)
  const memText = memories.map(m => `[${m.source_type}] ${m.title}:\n${(m.summary as string | null) ?? (m.raw_text as string).slice(0, 500)}`).join('\n\n---\n\n')
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Summarize all project memory documents for "${project.name as string}" into a concise operational knowledge brief.\n\n${memText.slice(0, 6000)}\n\nStructure:\n## KEY DECISIONS ACROSS ALL MEMORY\n## ARCHITECTURE PATTERNS IDENTIFIED\n## RECURRING BLOCKERS\n## CRITICAL WARNINGS\n## KNOWLEDGE GAPS\n\nBe specific. Extract the most actionable insights.`,
    }],
  })
  const summaryText = res.content[0].type === 'text' ? res.content[0].text : ''
  await completeStep(db, steps[1].id, { length: summaryText.length })

  await startStep(db, steps[2].id)
  const noteContent = `[MEMORY BRIEF — ${new Date().toDateString()} — ${memories.length} sources]\n\n${summaryText}`
  await db.from('notes').insert({ project_id: project.id as string, note: noteContent })
  await completeStep(db, steps[2].id, { saved_as_note: true })

  await startStep(db, steps[3].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'memory_ingested', title: `Memory brief created: ${project.name as string}`, description: `${memories.length} memory sources synthesised`, severity: 'info', metadata: { workflow_run_id: runId } })
  await logAction({ action_type: 'memory_summarized', project_id: project.id as string, summary: `Summarised ${memories.length} memory documents for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[3].id, {})

  return { summary: `Memory brief created from ${memories.length} sources`, memory_count: memories.length, requires_approval: false, summary_preview: summaryText.slice(0, 400) }
}

async function runStatusSnapshot(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const [tasks, blockers, decisions, archRules, memories] = await Promise.all([
    db.from('tasks').select('*').eq('project_id', project.id as string).neq('status', 'done').order('created_at', { ascending: false }).limit(20),
    db.from('blockers').select('*').eq('project_id', project.id as string).neq('status', 'resolved'),
    db.from('decisions').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(10),
    db.from('architecture_rules').select('*').eq('project_id', project.id as string),
    db.from('project_memories').select('title, summary').eq('project_id', project.id as string).eq('ingestion_status', 'complete').limit(5),
  ])
  await completeStep(db, steps[0].id, { context_loaded: true })

  await startStep(db, steps[1].id)
  const ctx_text = buildContextText(project, { tasks: tasks.data ?? [], decisions: decisions.data ?? [], blockers: blockers.data ?? [] })
  const archText = (archRules.data ?? []).map(a => `  [${a.category}] ${a.rule}`).join('\n') || '  None'
  const memText = (memories.data ?? []).map(m => `  • ${m.title}`).join('\n') || '  None'

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Create a complete project status snapshot for "${project.name as string}" as of ${new Date().toDateString()}.\n\n${ctx_text}\n\nARCHITECTURE RULES:\n${archText}\n\nINGESTED MEMORIES:\n${memText}\n\nGenerate a dense, factual snapshot including:\n## CURRENT STATE (one paragraph, all facts)\n## OPEN BLOCKERS & RISKS\n## TASK QUEUE STATUS\n## ARCHITECTURAL CONSTRAINTS\n## NEXT 3 ACTIONS\n## OPERATOR WARNINGS\n\nThis snapshot should give a new operator full situational awareness in 60 seconds.`,
    }],
  })
  const snapshotText = res.content[0].type === 'text' ? res.content[0].text : ''
  await completeStep(db, steps[1].id, { length: snapshotText.length })

  await startStep(db, steps[2].id)
  await db.from('notes').insert({ project_id: project.id as string, note: `[STATUS SNAPSHOT — ${new Date().toISOString()}]\n\n${snapshotText}` })
  await completeStep(db, steps[2].id, { saved_as_note: true })

  await startStep(db, steps[3].id)
  const { data: approval } = await db.from('approvals').insert({
    approval_type: 'status_snapshot_review',
    title: `Review status snapshot: ${project.name as string}`,
    description: snapshotText.slice(0, 300),
    payload: { workflow_run_id: runId, snapshot_preview: snapshotText.slice(0, 800) },
    project_id: project.id as string,
    entity_type: 'status_snapshot',
    entity_id: null,
  }).select().single()
  await completeStep(db, steps[3].id, { approval_id: approval?.id })

  await startStep(db, steps[4].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'prompt_generated', title: `Status snapshot: ${project.name as string}`, severity: 'info', metadata: { workflow_run_id: runId } })
  await logAction({ action_type: 'status_snapshot', project_id: project.id as string, summary: `Status snapshot created for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[4].id, {})

  return { summary: `Status snapshot created for ${project.name as string}`, approval_id: approval?.id, requires_approval: true, snapshot_preview: snapshotText.slice(0, 500) }
}

async function runReviewBlockers(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const { data: blockers } = await db.from('blockers').select('*').eq('project_id', project.id as string).neq('status', 'resolved').order('created_at', { ascending: false })
  await completeStep(db, steps[0].id, { blocker_count: blockers?.length ?? 0 })

  if (!blockers?.length) {
    await skipRemaining(db, steps.slice(1).map(s => s.id))
    return { summary: 'No open blockers found', requires_approval: false, recommended_actions: ['All clear — no open blockers'], risks: [] }
  }

  await startStep(db, steps[1].id)
  const blockerText = blockers.map(b => `  [${b.severity}][${b.status}] ${b.title}${b.description ? '\n    ' + b.description : ''}`).join('\n')
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Analyse these open blockers for ${project.name as string} and generate structured output.\n\nBLOCKERS:\n${blockerText}\n\nProject state: phase=${project.current_phase ?? 'unknown'} | risk=${project.risk_level ?? 'unknown'}\n\nReturn JSON:\n{\n  "summary": "...",\n  "blocker_analysis": "...",\n  "recommended_actions": ["action 1", "action 2"],\n  "risks": ["risk 1", "risk 2"],\n  "claude_code_prompt": "...",\n  "priority_blocker": "name of most critical blocker"\n}\n\nReturn ONLY valid JSON.`,
    }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text : '{}'
  const parsed = tryParseJson(raw) ?? { summary: `${blockers.length} blockers reviewed`, blocker_analysis: raw, recommended_actions: [], risks: [] }
  await completeStep(db, steps[1].id, { parsed_ok: parsed !== null })

  await startStep(db, steps[2].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'workflow_completed', title: `Blocker review: ${project.name as string} (${blockers.length} blockers)`, severity: blockers.some(b => b.severity === 'critical') ? 'critical' : 'warning', metadata: { workflow_run_id: runId, blocker_count: blockers.length } })
  await logAction({ action_type: 'blocker_review', project_id: project.id as string, summary: `Reviewed ${blockers.length} blockers for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[2].id, {})

  await completeStep(db, steps[3].id, {})

  return { ...parsed, requires_approval: false }
}

async function runNextActionPlan(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { runId, project, db, steps } = ctx
  if (!project) throw new Error('Project required')

  await startStep(db, steps[0].id)
  const [tasks, blockers, decisions, notes] = await Promise.all([
    db.from('tasks').select('*').eq('project_id', project.id as string).neq('status', 'done').order('created_at', { ascending: false }).limit(15),
    db.from('blockers').select('*').eq('project_id', project.id as string).neq('status', 'resolved'),
    db.from('decisions').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(8),
    db.from('notes').select('*').eq('project_id', project.id as string).order('created_at', { ascending: false }).limit(5),
  ])
  await completeStep(db, steps[0].id, { context_loaded: true })

  await startStep(db, steps[1].id)
  const ctx_text = buildContextText(project, { tasks: tasks.data ?? [], decisions: decisions.data ?? [], blockers: blockers.data ?? [], notes: notes.data ?? [] })
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Generate a next-action plan for ${project.name as string} for the next 48 hours.\n\n${ctx_text}\n\nReturn JSON:\n{\n  "summary": "One sentence situation summary",\n  "recommended_actions": [\n    {"rank": 1, "action": "...", "reason": "...", "estimated_time": "30min"},\n    {"rank": 2, "action": "...", "reason": "...", "estimated_time": "2h"}\n  ],\n  "risks": ["risk if you skip action 1", "risk 2"],\n  "do_not_break": ["rule 1", "rule 2"],\n  "claude_code_prompt": "Full copy-pasteable Claude Code prompt for the #1 action",\n  "warnings": ["warning 1"]\n}\n\nReturn ONLY valid JSON.`,
    }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text : '{}'
  const parsed = tryParseJson(raw) ?? { summary: 'Action plan generated', recommended_actions: [], risks: [], do_not_break: [], claude_code_prompt: raw, warnings: [] }
  await completeStep(db, steps[1].id, { parsed_ok: true })

  await startStep(db, steps[2].id)
  const planNote = `[ACTION PLAN — ${new Date().toDateString()}]\n${JSON.stringify(parsed, null, 2)}`
  await db.from('notes').insert({ project_id: project.id as string, note: planNote })
  await completeStep(db, steps[2].id, { saved_as_note: true })

  await startStep(db, steps[3].id)
  const { data: approval } = await db.from('approvals').insert({
    approval_type: 'action_plan_review',
    title: `Review next action plan: ${project.name as string}`,
    description: (parsed as Record<string, unknown>).summary as string ?? 'Action plan generated',
    payload: { plan: parsed, workflow_run_id: runId },
    project_id: project.id as string,
    entity_type: 'action_plan',
    entity_id: null,
  }).select().single()
  await completeStep(db, steps[3].id, { approval_id: approval?.id })

  await startStep(db, steps[4].id)
  await emitFeedEvent(db, { project_id: project.id as string, event_type: 'workflow_completed', title: `Action plan ready: ${project.name as string}`, severity: 'success', metadata: { workflow_run_id: runId, approval_id: approval?.id } })
  await logAction({ action_type: 'action_plan_generated', project_id: project.id as string, summary: `Next action plan generated for ${project.name as string}`, status: 'completed' })
  await completeStep(db, steps[4].id, {})

  return { ...parsed, approval_id: approval?.id, requires_approval: true }
}

// ── Gmail: Process Inbox ──────────────────────────────────────────────────────

async function runProcessGmailInbox(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { db, steps } = ctx

  // Step 0: Sync emails
  await startStep(db, steps[0].id)
  const account = await getActiveAccount()
  if (!account) {
    await failStep(db, steps[0].id, 'No connected Gmail account')
    await skipRemaining(db, steps.slice(1).map(s => s.id))
    return { summary: 'No Gmail account connected', requires_approval: false }
  }
  const emails = await fetchRecentEmails(30)
  let synced = 0
  for (const email of emails) {
    const { error } = await db.from('emails').upsert({
      account_id: account.id as string,
      gmail_id: email.gmail_id,
      thread_id: email.thread_id,
      subject: email.subject,
      sender_email: email.sender_email,
      sender_name: email.sender_name,
      recipient_emails: email.recipient_emails,
      snippet: email.snippet,
      body_text: email.body_text,
      received_at: email.received_at,
      is_read: false,
    }, { onConflict: 'gmail_id', ignoreDuplicates: true })
    if (!error) synced++
  }
  await db.from('email_accounts').update({ last_synced_at: new Date().toISOString() }).eq('id', account.id as string)
  await completeStep(db, steps[0].id, { synced, total_fetched: emails.length })

  // Step 1: Triage unsorted emails
  await startStep(db, steps[1].id)
  const { data: untriagedEmails } = await db
    .from('emails')
    .select('id, subject, sender_email, snippet, body_text')
    .eq('category', 'uncategorized')
    .order('received_at', { ascending: false })
    .limit(10)

  const { data: projects } = await db.from('projects').select('id, name').neq('status', 'archived')
  const projectList = (projects ?? []).map((p: Record<string, unknown>) => `${p.name as string} (id: ${p.id as string})`).join('\n')

  let triaged = 0
  let urgentCount = 0
  let taskApprovalCount = 0
  let draftApprovalCount = 0

  for (const email of untriagedEmails ?? []) {
    try {
      const prompt = `Classify this email and return JSON only:
From: ${(email as Record<string, unknown>).sender_email as string}
Subject: ${(email as Record<string, unknown>).subject as string ?? ''}
Body: ${((email as Record<string, unknown>).body_text as string ?? '').slice(0, 800)}
Projects: ${projectList}
Return: {"classification":"urgent|project_related|admin|finance|opportunity|ignore","urgency":"critical|high|medium|low","linked_project_id":"<uuid or null>","requires_action":true|false,"extracted_tasks":[{"title":"...","priority":"high|medium|low","deadline":"...or null"}],"suggested_reply":"...or null","confidence":0.0,"reasoning":"..."}`

      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const parsed = tryParseJson(text)
      if (!parsed) continue

      await db.from('email_triage_results').insert({
        email_id: (email as Record<string, unknown>).id as string,
        classification: parsed.classification as string,
        urgency: parsed.urgency as string,
        project_id: parsed.linked_project_id as string | null,
        extracted_tasks: parsed.extracted_tasks as Record<string, unknown>[],
        summary: parsed.reasoning as string,
        suggested_reply: parsed.suggested_reply as string | null,
        priority_score: parsed.urgency === 'critical' ? 100 : parsed.urgency === 'high' ? 75 : parsed.urgency === 'medium' ? 50 : 25,
        confidence: parsed.confidence as number,
        reasoning: parsed.reasoning as string,
      })

      await db.from('emails').update({
        category: parsed.classification as string,
        urgency: parsed.urgency as string,
        linked_project_id: parsed.linked_project_id as string | null,
        requires_action: parsed.requires_action as boolean,
      }).eq('id', (email as Record<string, unknown>).id as string)

      triaged++
      if (parsed.urgency === 'critical' || parsed.urgency === 'high') urgentCount++

      const tasks = parsed.extracted_tasks as Array<Record<string, unknown>> | null
      if (tasks?.length && parsed.requires_action) {
        taskApprovalCount++
        await db.from('approvals').insert({
          approval_type: 'email.task_extraction',
          title: `Approve extracted tasks from: "${(email as Record<string, unknown>).subject as string ?? 'email'}"`,
          description: `${tasks.length} task(s) extracted`,
          payload: { email_id: (email as Record<string, unknown>).id as string, tasks },
          entity_type: 'email',
          entity_id: (email as Record<string, unknown>).id as string,
          status: 'pending',
        })
      }

      if (parsed.suggested_reply && parsed.requires_action) {
        draftApprovalCount++
        const { data: draft } = await db.from('email_drafts').insert({
          email_id: (email as Record<string, unknown>).id as string,
          to_address: (email as Record<string, unknown>).sender_email as string,
          subject: `Re: ${(email as Record<string, unknown>).subject as string ?? ''}`,
          body: parsed.suggested_reply as string,
          status: 'pending',
        }).select().single()

        await db.from('approvals').insert({
          approval_type: 'email.draft_reply',
          title: `Approve draft reply to: "${(email as Record<string, unknown>).subject as string ?? 'email'}"`,
          payload: { email_id: (email as Record<string, unknown>).id as string, draft_id: draft?.id },
          entity_type: 'email_draft',
          entity_id: draft?.id,
          status: 'pending',
        })
      }
    } catch { /* skip individual failures */ }
  }

  await completeStep(db, steps[1].id, { triaged, urgent: urgentCount })

  // Steps 2-5: Mark completed (covered inline above)
  await completeStep(db, steps[2].id, { task_approvals: taskApprovalCount })
  await completeStep(db, steps[3].id, { draft_approvals: draftApprovalCount })
  await completeStep(db, steps[4].id, {})

  await emitFeedEvent(db, {
    event_type: 'gmail_workflow_completed',
    title: `Gmail inbox processed — ${synced} synced, ${triaged} triaged, ${urgentCount} urgent`,
    severity: urgentCount > 0 ? 'warning' : 'success',
    metadata: { synced, triaged, urgent: urgentCount, task_approvals: taskApprovalCount },
  })

  await logAction({
    action_type: 'gmail.process_inbox',
    summary: `Processed inbox: ${synced} synced, ${triaged} triaged, ${urgentCount} urgent`,
    status: 'completed',
  })

  await completeStep(db, steps[5].id, {})

  return {
    summary: `Processed Gmail inbox: ${synced} emails synced, ${triaged} triaged, ${urgentCount} urgent`,
    synced,
    triaged,
    urgent: urgentCount,
    task_approvals: taskApprovalCount,
    draft_approvals: draftApprovalCount,
    requires_approval: taskApprovalCount > 0 || draftApprovalCount > 0,
  }
}

// ── Gmail: Review Urgent Emails ───────────────────────────────────────────────

async function runReviewUrgentEmails(ctx: WorkflowCtx): Promise<Record<string, unknown>> {
  const { db, steps } = ctx

  // Step 0: Find critical/high emails
  await startStep(db, steps[0].id)
  const { data: urgentEmails } = await db
    .from('emails')
    .select('id, subject, sender_email, snippet, body_text, received_at, urgency, category')
    .in('urgency', ['critical', 'high'])
    .order('received_at', { ascending: false })
    .limit(10)

  if (!urgentEmails?.length) {
    await completeStep(db, steps[0].id, { found: 0 })
    await skipRemaining(db, steps.slice(1).map(s => s.id))
    return { summary: 'No urgent emails found', requires_approval: false }
  }
  await completeStep(db, steps[0].id, { found: urgentEmails.length })

  // Step 1: Summarize with Claude
  await startStep(db, steps[1].id)
  const emailsText = urgentEmails.map((e: Record<string, unknown>, i: number) =>
    `${i + 1}. [${(e.urgency as string).toUpperCase()}] "${e.subject as string}" from ${e.sender_email as string}\n   ${(e.snippet as string ?? '').slice(0, 200)}`
  ).join('\n\n')

  const summaryResp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are an operational intelligence assistant. Review these urgent emails and return structured JSON.

URGENT EMAILS:
${emailsText}

Return JSON:
{
  "summary": "2-3 sentence overview",
  "items": [
    {
      "subject": "...",
      "sender": "...",
      "urgency": "critical|high",
      "key_point": "what this is about in 1 sentence",
      "recommended_action": "what to do",
      "deadline": "if mentioned, else null"
    }
  ],
  "overall_priority": "critical|high|medium",
  "claude_code_prompt": "actionable prompt for next steps"
}`,
    }],
  })

  const summaryText = summaryResp.content[0].type === 'text' ? summaryResp.content[0].text : ''
  const parsed = tryParseJson(summaryText)
  await completeStep(db, steps[1].id, { emails_reviewed: urgentEmails.length })

  // Step 2: Recommend actions
  await startStep(db, steps[2].id)
  await completeStep(db, steps[2].id, parsed ?? { summary: summaryText })

  // Step 3: Return output
  await startStep(db, steps[3].id)
  await completeStep(db, steps[3].id, parsed ?? {})

  await emitFeedEvent(db, {
    event_type: 'urgent_emails_reviewed',
    title: `Urgent email review completed — ${urgentEmails.length} reviewed`,
    severity: 'warning',
    metadata: { count: urgentEmails.length },
  })

  await logAction({
    action_type: 'gmail.review_urgent',
    summary: `Reviewed ${urgentEmails.length} urgent emails`,
    status: 'completed',
  })

  return {
    summary: `Reviewed ${urgentEmails.length} urgent emails`,
    requires_approval: false,
    ...(parsed ?? { raw: summaryText }),
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

const WORKFLOW_HANDLERS: Record<string, (ctx: WorkflowCtx) => Promise<Record<string, unknown>>> = {
  'Generate Project Handover':   runGenerateHandover,
  'Generate Claude Code Prompt': runGeneratePrompt,
  'Generate Weekly Report':      runGenerateWeeklyReport,
  'Extract Tasks From Notes':    runExtractTasksFromNotes,
  'Summarize Project Memory':    runSummarizeMemory,
  'Create Project Status Snapshot': runStatusSnapshot,
  'Review Blockers':             runReviewBlockers,
  'Create Next Action Plan':     runNextActionPlan,
  'Process Gmail Inbox':         runProcessGmailInbox,
  'Review Urgent Emails':        runReviewUrgentEmails,
}

export async function executeWorkflow(runId: string): Promise<{ success: boolean; output: Record<string, unknown> }> {
  const db = getAdmin()

  // Load run + template
  const { data: run } = await db.from('workflow_runs')
    .select('*, template:workflow_templates(*)')
    .eq('id', runId)
    .single()

  if (!run) {
    return { success: false, output: { error: 'Run not found' } }
  }

  const template = run.template as { name: string; steps: Array<{ name: string }> }
  const templateSteps = template.steps ?? []

  // Create step records
  const stepRecords: StepRecord[] = []
  for (let i = 0; i < templateSteps.length; i++) {
    const { data } = await db.from('workflow_run_steps').insert({
      workflow_run_id: runId,
      step_index: i,
      step_name: templateSteps[i].name,
      status: 'pending',
    }).select('id, step_index, step_name').single()
    if (data) stepRecords.push(data as StepRecord)
  }

  // Mark run as running
  await db.from('workflow_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)

  await emitFeedEvent(db, {
    project_id: run.project_id as string | null,
    event_type: 'workflow_started',
    title: `Workflow started: ${template.name}`,
    severity: 'info',
    metadata: { workflow_run_id: runId, template_name: template.name },
  })

  await logAction({
    action_type: 'workflow_started',
    entity_type: 'workflow_run',
    entity_id: runId,
    project_id: run.project_id as string | null,
    summary: `Started workflow: ${template.name}`,
    status: 'completed',
  })

  // Load project
  let project: Record<string, unknown> | null = null
  if (run.project_id) {
    const { data } = await db.from('projects').select('*').eq('id', run.project_id as string).single()
    project = data as Record<string, unknown> | null
  }

  const ctx: WorkflowCtx = { runId, project, db, steps: stepRecords }

  // Dispatch
  const handler = WORKFLOW_HANDLERS[template.name]
  if (!handler) {
    const error = `No handler for workflow: ${template.name}`
    await db.from('workflow_runs').update({ status: 'failed', error, completed_at: new Date().toISOString() }).eq('id', runId)
    await skipRemaining(db, stepRecords.map(s => s.id))
    return { success: false, output: { error } }
  }

  try {
    const output = await handler(ctx)
    const finalStatus = output.requires_approval ? 'waiting_approval' : 'completed'

    await db.from('workflow_runs').update({ status: finalStatus, output, completed_at: new Date().toISOString() }).eq('id', runId)

    await emitFeedEvent(db, {
      project_id: run.project_id as string | null,
      event_type: 'workflow_completed',
      title: `Workflow completed: ${template.name}`,
      description: (output.summary as string | undefined) ?? null,
      severity: 'success',
      metadata: { workflow_run_id: runId, requires_approval: output.requires_approval },
    })

    await logAction({
      action_type: 'workflow_completed',
      entity_type: 'workflow_run',
      entity_id: runId,
      project_id: run.project_id as string | null,
      summary: `Completed: ${template.name} — ${(output.summary as string | undefined) ?? ''}`,
      status: 'completed',
    })

    return { success: true, output }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'

    await db.from('workflow_runs').update({ status: 'failed', error, completed_at: new Date().toISOString() }).eq('id', runId)
    await skipRemaining(db, stepRecords.filter(s => s.id).map(s => s.id))

    await emitFeedEvent(db, {
      project_id: run.project_id as string | null,
      event_type: 'workflow_failed',
      title: `Workflow failed: ${template.name}`,
      description: error,
      severity: 'critical',
      metadata: { workflow_run_id: runId, error },
    })

    await logAction({
      action_type: 'workflow_failed',
      entity_type: 'workflow_run',
      entity_id: runId,
      project_id: run.project_id as string | null,
      summary: `Failed: ${template.name} — ${error}`,
      status: 'failed',
      error_message: error,
    })

    return { success: false, output: { error } }
  }
}
