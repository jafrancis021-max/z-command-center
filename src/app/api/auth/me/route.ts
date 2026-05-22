import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const DEV_USER = {
  id:                 'dev-mock-user',
  email:              'jafrancis021@gmail.com',
  full_name:          'James',
  auth_id:            'dev-mock-user',
  workspace:          'Command Center',
  checklist_progress: {},
  preferences:        {},
  dev_mode:           true,
}

export async function GET(req: NextRequest) {
  // Dev-only bypass — never active in production
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
  ) {
    return NextResponse.json(DEV_USER)
  }

  const uid = req.cookies.get('z_uid')?.value
  if (!uid) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const db = getAdmin()
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, auth_id, checklist_progress, preferences')
    .eq('auth_id', uid)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    id:                  profile.id,
    email:               profile.email,
    full_name:           profile.full_name,
    auth_id:             profile.auth_id,
    checklist_progress:  profile.checklist_progress ?? {},
    preferences:         profile.preferences ?? {},
  })
}
