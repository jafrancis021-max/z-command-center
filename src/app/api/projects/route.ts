import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getAdmin()
  const { data, error } = await db
    .from('projects')
    .select('id, name, status')
    .neq('status', 'archived')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
