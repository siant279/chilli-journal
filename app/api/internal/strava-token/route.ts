import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/strava'

export async function GET(request: NextRequest) {
  const secret = process.env.JOURNAL_INTERNAL_SECRET
  if (!secret || request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const access_token = await getValidAccessToken()
    return NextResponse.json({ access_token })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
