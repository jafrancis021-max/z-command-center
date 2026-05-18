import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getAdmin()
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()

  const [
    activeJobsRes,
    failedRunsRes,
    lastSuccessRes,
    latestEmailRes,
    uncatEmailsRes,
    pendingApprovalsRes,
    staleApprovalsRes,
    openBlockersRes,
    criticalBlockersRes,
    feedRes,
    pendingSuggestionsRes,
    waitingChainRunsRes,
    activeMemoriesRes,
  ] = await Promise.allSettled([
    db.from('scheduled_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),

    db.from('job_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('started_at', since24h),

    db.from('job_runs')
      .select('finished_at')
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1),

    db.from('emails')
      .select('received_at')
      .order('received_at', { ascending: false })
      .limit(1),

    db.from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'uncategorized'),

    db.from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),

    db.from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', since24h),

    db.from('blockers')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'resolved'),

    db.from('blockers')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'resolved')
      .eq('severity', 'critical'),

    db.from('operational_feed_events')
      .select('id, event_type, title, severity, created_at')
      .order('created_at', { ascending: false })
      .limit(4),

    db.from('inbox_workflow_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'suggested'),

    db.from('workflow_chain_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting_approval'),

    db.from('operational_memories')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
  ])

  function getCount(res: PromiseSettledResult<{ count: number | null }>): number {
    return res.status === 'fulfilled' ? (res.value.count ?? 0) : 0
  }

  const activeJobs          = getCount(activeJobsRes as PromiseSettledResult<{ count: number | null }>)
  const recentFailures      = getCount(failedRunsRes  as PromiseSettledResult<{ count: number | null }>)
  const uncatCount          = getCount(uncatEmailsRes  as PromiseSettledResult<{ count: number | null }>)
  const pendingCount        = getCount(pendingApprovalsRes as PromiseSettledResult<{ count: number | null }>)
  const staleCount          = getCount(staleApprovalsRes   as PromiseSettledResult<{ count: number | null }>)
  const openBlockers        = getCount(openBlockersRes     as PromiseSettledResult<{ count: number | null }>)
  const criticalBlockers    = getCount(criticalBlockersRes as PromiseSettledResult<{ count: number | null }>)
  const pendingSuggestions  = getCount(pendingSuggestionsRes  as PromiseSettledResult<{ count: number | null }>)
  const waitingChainRuns    = getCount(waitingChainRunsRes    as PromiseSettledResult<{ count: number | null }>)
  const activeMemories      = getCount(activeMemoriesRes      as PromiseSettledResult<{ count: number | null }>)

  const lastSuccessAt =
    lastSuccessRes.status === 'fulfilled'
      ? ((lastSuccessRes.value.data as Array<{ finished_at: string | null }> | null)?.[0]?.finished_at ?? null)
      : null

  const latestEmailAt =
    latestEmailRes.status === 'fulfilled'
      ? ((latestEmailRes.value.data as Array<{ received_at: string | null }> | null)?.[0]?.received_at ?? null)
      : null

  const feedItems =
    feedRes.status === 'fulfilled'
      ? ((feedRes.value.data as Array<{ id: string; event_type: string; title: string; severity: string; created_at: string }> | null) ?? [])
      : []

  // Runtime health
  let runtimeStatus: 'healthy' | 'degraded' | 'error' = 'healthy'
  if (recentFailures > 2) runtimeStatus = 'error'
  else if (recentFailures > 0) runtimeStatus = 'degraded'

  // Focus: deterministic priority chain
  let focus: { title: string; reason: string; action_url: string }
  if (recentFailures > 0) {
    focus = {
      title:      'Runtime issue',
      reason:     `${recentFailures} job failure${recentFailures > 1 ? 's' : ''} in the last 24h`,
      action_url: '/dashboard',
    }
  } else if (staleCount > 0) {
    focus = {
      title:      'Stale approvals',
      reason:     `${staleCount} approval${staleCount > 1 ? 's' : ''} waiting >24h`,
      action_url: '/approvals',
    }
  } else if (criticalBlockers > 0) {
    focus = {
      title:      'Critical blockers',
      reason:     `${criticalBlockers} unresolved critical blocker${criticalBlockers > 1 ? 's' : ''}`,
      action_url: '/dashboard',
    }
  } else if (uncatCount > 0) {
    focus = {
      title:      'Inbox triage needed',
      reason:     `${uncatCount} uncategorised email${uncatCount > 1 ? 's' : ''}`,
      action_url: '/inbox',
    }
  } else {
    focus = {
      title:      'All clear',
      reason:     'No urgent issues',
      action_url: '/dashboard',
    }
  }

  return NextResponse.json({
    runtime: {
      status:          runtimeStatus,
      active_jobs:     activeJobs,
      recent_failures: recentFailures,
      last_success_at: lastSuccessAt,
    },
    inbox: {
      uncategorised_count: uncatCount,
      latest_email_at:     latestEmailAt,
    },
    approvals: {
      pending_count: pendingCount,
      stale_count:   staleCount,
    },
    blockers: {
      open_count:     openBlockers,
      critical_count: criticalBlockers,
    },
    suggestions: {
      pending_count: pendingSuggestions,
    },
    chains: {
      waiting_count: waitingChainRuns,
    },
    memories: {
      active_count: activeMemories,
    },
    feed:  feedItems,
    focus,
  })
}
