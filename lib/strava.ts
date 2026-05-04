import { supabaseAdmin } from './supabase'

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!
const BASE_URL = 'https://www.strava.com/api/v3'

export function getStravaAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'force',
    scope: 'activity:read_all',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export async function exchangeCodeForTokens(code: string) {
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!resp.ok) throw new Error(`Strava token exchange failed: ${resp.status}`)
  return resp.json()
}

export async function refreshAccessToken(refreshToken: string) {
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!resp.ok) throw new Error(`Strava token refresh failed: ${resp.status}`)
  return resp.json()
}

// Gets a valid access token, refreshing if needed
export async function getValidAccessToken(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('strava_tokens')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) throw new Error('No Strava tokens found. Please connect Strava first.')

  // If token expires in less than 5 minutes, refresh
  if (data.expires_at * 1000 < Date.now() + 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(data.refresh_token)
    await supabaseAdmin.from('strava_tokens').upsert({
      id: 1,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    return refreshed.access_token
  }

  return data.access_token
}

export async function saveTokens(tokenData: {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number }
}) {
  await supabaseAdmin.from('strava_tokens').upsert({
    id: 1,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    athlete_id: tokenData.athlete?.id,
    updated_at: new Date().toISOString(),
  })
}

// Fetch all activities (paginated)
export async function fetchAllActivities(accessToken: string, after?: number) {
  const allActivities: any[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    })
    if (after) params.set('after', String(after))

    const resp = await fetch(`${BASE_URL}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) throw new Error(`Strava activities fetch failed: ${resp.status}`)

    const activities = await resp.json()
    if (!activities.length) break

    allActivities.push(...activities)
    if (activities.length < perPage) break
    page++

    // Rate limit safety
    await sleep(100)
  }

  return allActivities
}

/** Non‑standard codes sometimes seen from Strava/CDN edges when upstream stalls (treat like transient). */
function isTransientStravaActivityStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 597 || status >= 500
}

// Fetch a single activity with full details
export async function fetchActivity(accessToken: string, activityId: number) {
  const maxAttempts = 4
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetch(`${BASE_URL}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) return resp.json()
    if (attempt < maxAttempts - 1 && isTransientStravaActivityStatus(resp.status)) {
      await sleep(400 * (attempt + 1))
      continue
    }
    const body = await resp.text().catch(() => '')
    throw new Error(
      `Strava activity fetch failed: ${resp.status}${body ? ` — ${body.slice(0, 200)}` : ''}`.trim()
    )
  }
  throw new Error('Strava activity fetch failed: exhausted retries')
}

// Fetch photos for an activity
export async function fetchActivityPhotos(accessToken: string, activityId: number): Promise<string[]> {
  try {
    const resp = await fetch(`${BASE_URL}/activities/${activityId}/photos?photo_sources=true&size=1200`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return []
    const photos = await resp.json()
    return photos.map((p: any) => p.urls?.['1200'] || p.urls?.['600'] || '').filter(Boolean)
  } catch {
    return []
  }
}

// Filter activities for Chilli walks (see PROJECT_BRIEF: "Chilli" OR "Fi", case insensitive)
export function isChilliActivity(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('chilli') || lower.includes('fi')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
