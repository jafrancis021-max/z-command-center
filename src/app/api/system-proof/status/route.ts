import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface RunRow {
  id:             string
  overall_status: string
  checked_at:     string
  duration_ms:    number
  pass_count:     number
  warning_count:  number
  fail_count:     number
  total_count:    number
}

export async function GET() {
  const db = getAdmin()
  try {
    const { data } = await db
      .from('system_proof_runs')
      .select('id, overall_status, checked_at, duration_ms, pass_count, warning_count, fail_count, total_count')
      .order('checked_at', { ascending: false })
      .limit(10)

    const runs = (data ?? []) as RunRow[]

    return NextResponse.json({
      last_run: runs[0] ?? null,
      history:  runs,
    })
  } catch {
    return NextResponse.json({ last_run: null, history: [] })
  }
}
