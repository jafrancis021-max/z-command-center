import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProjectContext, savePrompt } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const { projectId } = await req.json()
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const ctx = await getProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { project, tasks, decisions, notes } = ctx

    const activeTasks = tasks.filter(t => t.status !== 'done').slice(0, 8)
    const blockedTasks = tasks.filter(t => t.status === 'blocked')

    const contextBlock = `
PROJECT: ${project.name}
STATUS: ${project.status}
DESCRIPTION: ${project.description ?? 'N/A'}

ACTIVE TASKS:
${activeTasks.map(t => `- [${t.priority.toUpperCase()}] ${t.title}${t.description ? ': ' + t.description : ''} (${t.status})`).join('\n') || 'None'}

BLOCKED:
${blockedTasks.map(t => `- ${t.title}`).join('\n') || 'None'}

RECENT DECISIONS:
${decisions.slice(0, 5).map(d => `- ${d.decision}`).join('\n') || 'None'}

RECENT NOTES:
${notes.slice(0, 4).map(n => `- ${n.note}`).join('\n') || 'None'}
`.trim()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Generate a complete, ready-to-paste Claude Code build prompt for the following project context.

The prompt must:
1. Open with a clear, specific task statement
2. Include the full tech stack and constraints
3. List what already exists and what to build
4. Include architectural rules from the decisions
5. Specify exact acceptance criteria
6. Be immediately usable — no placeholders

Project context:
${contextBlock}

Output ONLY the prompt itself. No preamble, no explanation. Start directly with the task.`,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const saved = await savePrompt(projectId, 'claude-code', content.text)
    return NextResponse.json({ prompt: content.text, id: saved.id })
  } catch (err) {
    console.error('[/api/generate-prompt]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
