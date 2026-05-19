import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getAdmin()

  const { data: workspace } = await db
    .from('workspaces')
    .select('id, name, slug, status, organization_id')
    .eq('slug', 'command-center')
    .single()

  if (!workspace) {
    return NextResponse.json({ error: 'No workspace configured' }, { status: 404 })
  }

  const ws = workspace as {
    id: string; name: string; slug: string; status: string; organization_id: string
  }

  const { data: org } = await db
    .from('organizations')
    .select('id, name, slug, status')
    .eq('id', ws.organization_id)
    .single()

  return NextResponse.json({
    organization: org ?? null,
    workspace: {
      id:     ws.id,
      name:   ws.name,
      slug:   ws.slug,
      status: ws.status,
    },
    role: 'owner',
  })
}
