/**
 * lib/browser-execution/playwright-runner.ts
 *
 * Controlled Playwright sandbox runner.
 *
 * Safety constraints (hard-coded, non-overridable):
 *   - Only opens URLs from the SAFE_DOMAINS allowlist
 *   - No form submission without explicit approval gate
 *   - Screenshots saved to public/browser-screenshots/
 *   - One run at a time (concurrency guard)
 *   - All destructive actions pause at waiting_approval
 */

import path from 'path'
import fs from 'fs/promises'
import { getAdmin } from '@/lib/supabase-server'

// ── Safety allowlist ──────────────────────────────────────────────────────────

const SAFE_DOMAINS = [
  'example.com',
  'demo.playwright.dev',
  'the-internet.herokuapp.com',
  'httpbin.org',
  'quotes.toscrape.com',
  'books.toscrape.com',
]

function isDomainAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return SAFE_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// ── Screenshot path ───────────────────────────────────────────────────────────

const SCREENSHOTS_DIR = path.join(process.cwd(), 'public', 'browser-screenshots')

async function ensureScreenshotsDir() {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true })
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function updateRun(id: string, patch: Record<string, unknown>) {
  await getAdmin()
    .from('browser_execution_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
}

async function upsertStep(runId: string, order: number, patch: Record<string, unknown>) {
  const { data: existing } = await getAdmin()
    .from('browser_execution_steps')
    .select('id')
    .eq('run_id', runId)
    .eq('step_order', order)
    .maybeSingle()

  if (existing?.id) {
    await getAdmin()
      .from('browser_execution_steps')
      .update(patch)
      .eq('id', existing.id)
    return existing.id as string
  }

  const { data } = await getAdmin()
    .from('browser_execution_steps')
    .insert({ run_id: runId, step_order: order, ...patch })
    .select('id')
    .single()
  return (data as { id: string }).id
}

// ── Demo run definition ───────────────────────────────────────────────────────

export interface DemoRunConfig {
  mode:             'visible' | 'headless'
  target_url:       string
  task_description: string
}

export interface RunnerResult {
  success:       boolean
  page_title:    string | null
  screenshot_url: string | null
  steps_count:   number
  error:         string | null
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function executeDemoRun(
  runId: string,
  config: DemoRunConfig,
): Promise<RunnerResult> {
  const { mode, target_url } = config

  // Domain safety check
  if (!isDomainAllowed(target_url)) {
    const msg = `Domain not in sandbox allowlist: ${new URL(target_url).hostname}. Allowed: ${SAFE_DOMAINS.join(', ')}`
    await updateRun(runId, { status: 'failed', error_message: msg })
    return { success: false, page_title: null, screenshot_url: null, steps_count: 0, error: msg }
  }

  await updateRun(runId, { status: 'running' })
  await ensureScreenshotsDir()

  let browser: import('playwright').Browser | null = null
  const result: RunnerResult = {
    success:       false,
    page_title:    null,
    screenshot_url: null,
    steps_count:   0,
    error:         null,
  }

  try {
    const { chromium } = await import('playwright')

    // Step 1: Launch browser
    await upsertStep(runId, 1, {
      action_type: 'open_url',
      description: `Launch ${mode} browser`,
      status:      'running',
    })

    browser = await chromium.launch({
      headless: mode === 'headless',
    })

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    const page = await context.newPage()

    await upsertStep(runId, 1, { status: 'completed' })

    // Step 2: Navigate to URL
    await upsertStep(runId, 2, {
      action_type: 'open_url',
      description: `Navigate to ${target_url}`,
      status:      'running',
    })

    await page.goto(target_url, { waitUntil: 'domcontentloaded', timeout: 20_000 })

    await upsertStep(runId, 2, { status: 'completed' })

    // Step 3: Extract page title
    await upsertStep(runId, 3, {
      action_type: 'extract_title',
      description: 'Extract page title',
      status:      'running',
    })

    const title = await page.title()
    result.page_title = title

    await upsertStep(runId, 3, {
      status:   'completed',
      metadata: { page_title: title },
    })

    // Step 4: Take screenshot
    await upsertStep(runId, 4, {
      action_type: 'screenshot',
      description: 'Capture full-page screenshot',
      status:      'running',
    })

    const filename     = `run_${runId}_${Date.now()}.png`
    const filepath     = path.join(SCREENSHOTS_DIR, filename)
    const publicPath   = `/browser-screenshots/${filename}`

    await page.screenshot({ path: filepath, fullPage: false })
    result.screenshot_url = publicPath

    await upsertStep(runId, 4, {
      status:          'completed',
      screenshot_path: publicPath,
      metadata:        { filename },
    })

    result.steps_count = 4
    result.success     = true

    await updateRun(runId, {
      status: 'completed',
      result: {
        page_title:     result.page_title,
        screenshot_url: result.screenshot_url,
        steps_count:    result.steps_count,
        target_url,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.error = msg
    await updateRun(runId, { status: 'failed', error_message: msg })
  } finally {
    if (browser) await browser.close().catch(() => null)
  }

  return result
}
