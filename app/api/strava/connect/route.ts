import { NextRequest, NextResponse } from 'next/server'
import { getStravaAuthUrl } from '@/lib/strava'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/strava/callback`
  const authUrl = getStravaAuthUrl(redirectUri)
  return NextResponse.redirect(authUrl)
}
