import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/auth/',
  '/_next/',
  '/favicon',
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
  return res
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // CORS preflight — must run before auth so browsers can complete the handshake
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  // Dev-only bypass — never active in production
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
  ) {
    if (pathname.startsWith('/api/')) return withCors(NextResponse.next())
    return NextResponse.next()
  }

  // Allow public paths
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    if (pathname.startsWith('/api/')) return withCors(NextResponse.next())
    return NextResponse.next()
  }

  // Check for session cookie
  const uid = req.cookies.get('z_uid')?.value
  if (!uid) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/api/')) return withCors(NextResponse.next())
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
