import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const memoryId = searchParams.get('memory_id')
  if (!memoryId) return NextResponse.json({ extractions: [] })

  const db = getAdmin()
  const { data, error } = await db
    .from('memory_extractions')
    .select('*')
    .eq('memory_id', memoryId)
    .order('confidence', { ascending: false })

  if (error) return NextResponse.json({ extractions: [] })
  return NextResponse.json({ extractions: data ?? [] })
}
