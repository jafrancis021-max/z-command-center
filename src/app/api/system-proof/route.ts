import { NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { runSystemProof } from '@/lib/system-proof-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shouldPersist    = searchParams.get('persist') === 'true'

  try {
    const result      = await runSystemProof()
    const db          = getAdmin()
    const workspaceId = await getCurrentWorkspaceId()

    // Persist run to DB (scheduled worker calls with ?persist=true)
    if (shouldPersist) {
      await db.from('system_proof_runs').insert({
        overall_status: result.overall_status,
        checked_at:     result.checked_at,
        duration_ms:    result.duration_ms,
        pass_count:     result.summary.pass,
        warning_count:  result.summary.warning,
        fail_count:     result.summary.fail,
        total_count:    result.summary.total,
        checks:         result.checks,
      })
    }

    // Notification + audit on persist only (avoid flooding from manual page loads)
    if (shouldPersist && result.overall_status !== 'healthy') {
      const failedChecks = result.checks.filter(c => c.status === 'fail')
      const severity     = result.overall_status === 'critical' ? 'critical' : 'warning'
      const title        = result.overall_status === 'critical'
        ? `System Proof: ${result.summary.fail} subsystem(s) failing`
        : `System Proof: ${result.summary.warning} warning(s), ${result.summary.fail} failure(s)`
      const message = failedChecks.length > 0
        ? `Failed: ${failedChecks.map(c => c.name).join(', ')}`
        : `${result.summary.warning} check(s) returned warnings`

      const notifPayload: Record<string, unknown> = {
        type:      'system_proof',
        severity,
        title,
        message,
        read:      false,
        dismissed: false,
        metadata:  { overall_status: result.overall_status, summary: result.summary, checked_at: result.checked_at },
      }
      if (workspaceId) notifPayload.workspace_id = workspaceId

      await db.from('notifications').insert(notifPayload)
    }

    await logAction({
      action_type: 'system_proof_scan',
      entity_type: 'system',
      summary:     result.overall_status === 'healthy'
        ? `System Proof: all ${result.summary.total} checks passed`
        : `System Proof: ${result.summary.fail} fail(s), ${result.summary.warning} warning(s)`,
      output:      { overall_status: result.overall_status, summary: result.summary, persisted: shouldPersist },
      status:      result.overall_status === 'critical' ? 'failed' : 'completed',
      duration_ms: result.duration_ms,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/system-proof] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
