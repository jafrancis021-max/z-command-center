import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface ConfigRow   { key: string; value: string }
interface AuditRow {
  id:               string
  created_at:       string
  market_question:  string | null
  fixture_id:       string | null
  side:             string | null
  intended_price:   number | null
  size_usd:         number
  confidence:       number | null
  edge:             number | null
  execution_status: string
  reject_reason:    string | null
  slippage_bps:     number | null
  latency_ms:       number | null
  pnl_realized:     number | null
}

export async function GET() {
  const db = getAdmin()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [configRes, auditTodayRes, openPosRes, recentRes] = await Promise.allSettled([
    db.from('sportspulse_execution_config').select('key, value'),

    db.from('sportspulse_execution_audit')
      .select('id, created_at, market_question, fixture_id, side, intended_price, size_usd, confidence, edge, execution_status, reject_reason, slippage_bps, latency_ms, pnl_realized')
      .gte('created_at', todayIso)
      .order('created_at', { ascending: false }),

    db.from('sportspulse_execution_audit')
      .select('id', { count: 'exact', head: true })
      .in('execution_status', ['submitted', 'filled', 'partially_filled']),

    db.from('sportspulse_execution_audit')
      .select('id, created_at, market_question, fixture_id, side, intended_price, size_usd, confidence, edge, execution_status, reject_reason, slippage_bps, latency_ms, pnl_realized')
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  // Config
  const configRows: ConfigRow[] =
    configRes.status === 'fulfilled' ? ((configRes.value.data ?? []) as ConfigRow[]) : []
  const kv: Record<string, string> = {}
  for (const r of configRows) kv[r.key] = r.value

  const canaryEnabled = kv['live_canary_enabled'] === 'true'
  const configParsed = {
    max_bet_usd:          parseFloat(kv['max_bet_usd']          ?? '5'),
    daily_loss_limit_usd: parseFloat(kv['daily_loss_limit_usd'] ?? '20'),
    max_open_positions:   parseInt(kv['max_open_positions']      ?? '1', 10),
    min_pm_liquidity:     parseFloat(kv['min_pm_liquidity']      ?? '50'),
    max_slippage_bps:     parseFloat(kv['max_slippage_bps']      ?? '200'),
    require_confidence:   parseFloat(kv['require_confidence']    ?? '70'),
  }

  // Today's audit rows
  const todayRows: AuditRow[] =
    auditTodayRes.status === 'fulfilled' ? ((auditTodayRes.value.data ?? []) as AuditRow[]) : []

  const dailyPnl = todayRows
    .filter(r => ['filled', 'partially_filled'].includes(r.execution_status))
    .reduce((s, r) => s + (r.pnl_realized ?? 0), 0)

  const evaluatedToday  = todayRows.length
  const rejectedToday   = todayRows.filter(r => r.execution_status === 'gate_rejected').length
  const filledToday     = todayRows.filter(r => r.execution_status === 'filled').length
  const submittedToday  = todayRows.filter(r => r.execution_status === 'submitted').length

  const slippages = todayRows.filter(r => r.slippage_bps !== null).map(r => r.slippage_bps as number)
  const avgSlippageBps = slippages.length
    ? Math.round(slippages.reduce((a, b) => a + b, 0) / slippages.length)
    : null

  const latencies = todayRows.filter(r => r.latency_ms !== null).map(r => r.latency_ms as number)
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null

  // Open positions
  const openPositions =
    openPosRes.status === 'fulfilled' ? (openPosRes.value.count ?? 0) : 0

  // Recent audit log (all time, last 30)
  const recentAudit: AuditRow[] =
    recentRes.status === 'fulfilled' ? ((recentRes.value.data ?? []) as AuditRow[]) : []

  // Last actual execution (submitted/filled)
  const lastExecution = recentAudit.find(r =>
    ['submitted', 'filled', 'partially_filled'].includes(r.execution_status)
  ) ?? null

  return NextResponse.json({
    canary_enabled:    canaryEnabled,
    config:            configParsed,
    daily_pnl:         dailyPnl,
    open_positions:    openPositions,
    evaluated_today:   evaluatedToday,
    rejected_today:    rejectedToday,
    filled_today:      filledToday,
    submitted_today:   submittedToday,
    avg_slippage_bps:  avgSlippageBps,
    avg_latency_ms:    avgLatencyMs,
    last_execution:    lastExecution
      ? { market_question: lastExecution.market_question, at: lastExecution.created_at, status: lastExecution.execution_status }
      : null,
    recent_audit:      recentAudit,
  })
}
