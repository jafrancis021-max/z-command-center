import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getAdmin()
  const { data, error } = await db
    .from('workflow_templates')
    .select('*')
    .eq('enabled', true)
    .order('category')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
