import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { executeDemoRun } from '@/lib/browser-execution/playwright-runner'

export const dynamic = 'force-dynamic'

// Allowed demo targets
const DEMO_TARGETS = [
  { url: 'https://example.com',           label: 'Example.com (W3C placeholder)' },
  { url: 'https://books.toscrape.com',    label: 'Books to Scrape (safe demo catalog)' },
  { url: 'https://quotes.toscrape.com',   label: 'Quotes to Scrape (safe demo quotes)' },
  { url: 'https://httpbin.org/html',      label: 'HTTPBin HTML (test page)' },
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      target_url?:       string
      mode?:             'visible' | 'headless'
      task_description?: string
    }

    const target_url       = body.target_url       ?? DEMO_TARGETS[0].url
    const mode             = body.mode             ?? 'headless'
    const task_description = body.task_description ?? 'Demo sandbox run: open URL, extract title, take screenshot'

    const workspaceId = await getCurrentWorkspaceId()

    // Create the run record
    const { data: run, error: insertErr } = await getAdmin()
      .from('browser_execution_runs')
      .insert({
        workspace_id:     workspaceId ?? null,
        status:           'pending',
        mode,
        target_url,
        task_description,
      })
      .select('id')
      .single()

    if (insertErr || !run) {
      return NextResponse.json({ error: insertErr?.message ?? 'Failed to create run' }, { status: 500 })
    }

    const runId = (run as { id: string }).id

    // Execute asynchronously — respond immediately with the run ID
    // The runner updates DB as it goes; poll GET /runs/:id for progress
    void executeDemoRun(runId, { mode, target_url, task_description }).catch(err => {
      console.error('[browser-execution] runner error:', err)
    })

    return NextResponse.json({ run_id: runId, status: 'pending' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ demo_targets: DEMO_TARGETS })
}
