import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { getStravaAuthUrl } from '@/lib/strava'

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/strava/callback`
  const authUrl = getStravaAuthUrl(redirectUri)
  return NextResponse.redirect(authUrl)
}
