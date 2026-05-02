import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, saveTokens } from '@/lib/strava'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?strava_error=${error}`, request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?strava_error=no_code', request.url))
  }

  try {
    const tokenData = await exchangeCodeForTokens(code)
    await saveTokens(tokenData)
    return NextResponse.redirect(new URL('/?strava_connected=true', request.url))
  } catch (e) {
    console.error('Strava callback error:', e)
    return NextResponse.redirect(new URL('/?strava_error=token_exchange_failed', request.url))
  }
}
