import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProjectContext, saveHandover } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const { projectId } = await req.json()
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const ctx = await getProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { project, tasks, decisions, notes, prompts, handovers } = ctx

    const doneTasks = tasks.filter(t => t.status === 'done')
    const activeTasks = tasks.filter(t => t.status === 'doing')
    const todoTasks = tasks.filter(t => t.status === 'todo')
    const blockedTasks = tasks.filter(t => t.status === 'blocked')

    const contextBlock = `
PROJECT: ${project.name}
STATUS: ${project.status}
DESCRIPTION: ${project.description ?? 'N/A'}

COMPLETED TASKS (${doneTasks.length}):
${doneTasks.map(t => `- ${t.title}`).join('\n') || 'None'}

IN PROGRESS (${activeTasks.length}):
${activeTasks.map(t => `- ${t.title}: ${t.description ?? ''}`).join('\n') || 'None'}

TODO (${todoTasks.length}):
${todoTasks.map(t => `- [${t.priority}] ${t.title}`).join('\n') || 'None'}

BLOCKED (${blockedTasks.length}):
${blockedTasks.map(t => `- ${t.title}: ${t.description ?? ''}`).join('\n') || 'None'}

KEY DECISIONS:
${decisions.slice(0, 8).map(d => `- ${d.decision}`).join('\n') || 'None'}

RECENT NOTES:
${notes.slice(0, 5).map(n => `- ${n.note}`).join('\n') || 'None'}

PREVIOUS HANDOVER SUMMARY:
${handovers[0] ? handovers[0].content.slice(0, 400) + '...' : 'First handover'}
`.trim()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [
        {
          role: 'user',
          content: `Generate a complete project handover document for ${project.name}.

Project context:
${contextBlock}

Structure the handover exactly as:

# Handover: ${project.name}
**Date:** [today's date]

## What Has Been Built
[bullet list of completed work]

## What Is Working
[what's confirmed working]

## What Is Broken / Incomplete
[what needs fixing]

## Next Exact Step
[single most important next action — be specific]

## Architecture Reminders
[critical rules and constraints]

## Claude Code Next Prompt
[ready-to-paste prompt for the next session]

Be precise and actionable. No fluff.`,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const saved = await saveHandover(projectId, content.text)
    return NextResponse.json({ handover: content.text, id: saved.id })
  } catch (err) {
    console.error('[/api/generate-handover]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
