import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { access_token, full_name } = await req.json() as {
      access_token: string
      full_name?: string
    }

    if (!access_token) {
      return NextResponse.json({ error: 'access_token required' }, { status: 400 })
    }

    // Validate token by calling Supabase with it
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error } = await supabase.auth.getUser(access_token)

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Upsert profile linked to this auth user
    const db = getAdmin()
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .upsert(
        {
          auth_id:   user.id,
          email:     user.email ?? '',
          full_name: full_name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Member',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'auth_id' }
      )
      .select('id, email, full_name, auth_id, checklist_progress')
      .single()

    if (profileError) {
      console.error('[auth/session] profile upsert error:', profileError)
      // Still proceed — profile might exist under a different constraint
    }

    // Set httpOnly session cookie
    const res = NextResponse.json({
      user: {
        id:        user.id,
        email:     user.email,
        full_name: profile?.full_name ?? full_name ?? 'Member',
      },
    })

    res.cookies.set('z_uid', user.id, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30, // 30 days
      path:     '/',
    })

    return res
  } catch (err) {
    console.error('[api/auth/session]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
