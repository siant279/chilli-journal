import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionToken,
  isAdminPasswordValid,
} from '@/lib/adminAuth'

export async function POST(request: NextRequest) {
  if (!adminSessionToken()) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD is not configured on the server' },
      { status: 503 },
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!isAdminPasswordValid(body.password || '')) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const token = adminSessionToken()!
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions())
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions(0), maxAge: 0 })
  return res
}
