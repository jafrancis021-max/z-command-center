import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const db = getAdmin()
    const { data, error } = await db
      .from('weekly_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ reports: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
