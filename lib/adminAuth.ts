import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

export const ADMIN_COOKIE = 'chilli_admin'

function getAdminPassword(): string | null {
  const pwd = process.env.ADMIN_PASSWORD?.trim()
  return pwd || null
}

/** Stable cookie token derived from ADMIN_PASSWORD (no plaintext in the cookie). */
export function adminSessionToken(): string | null {
  const pwd = getAdminPassword()
  if (!pwd) return null
  return createHmac('sha256', pwd).update('chilli-journal-admin-v1').digest('hex')
}

export function isAdminPasswordValid(password: string): boolean {
  const expected = getAdminPassword()
  if (!expected) return false
  const a = Buffer.from(password)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function isAdminRequest(request: NextRequest): boolean {
  const expected = adminSessionToken()
  if (!expected) return false
  const got = request.cookies.get(ADMIN_COOKIE)?.value
  if (!got || got.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  } catch {
    return false
  }
}

export function adminCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}
