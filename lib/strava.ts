import { supabaseAdmin } from './supabase'

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!

/** Strava moves to api-v3.strava.com by 2027-06-01; that host is not live yet (ENOTFOUND as of 2026-06). */
const DEFAULT_STRAVA_API_BASE = 'https://www.strava.com/api/v3'
const BASE_URL = (process.env.STRAVA_API_BASE_URL?.trim() || DEFAULT_STRAVA_API_BASE).replace(/\/$/, '')

export function getStravaAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'force',
    scope: 'activity:read_all,activity:write',
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

// Fetch all activities (paginated). `after` / `before` are epoch seconds (Strava API).
export async function fetchAllActivities(accessToken: string, after?: number, before?: number) {
  const allActivities: any[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    })
    if (after !== undefined && after !== null) params.set('after', String(after))
    if (before !== undefined && before !== null) params.set('before', String(before))

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

function isTransientFetchThrow(e: unknown): boolean {
  const s =
    e instanceof Error
      ? `${e.message}${(e as Error & { cause?: unknown }).cause ? String((e as Error & { cause?: unknown }).cause) : ''}`
      : String(e)
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket|network|timed out|TLS|SSL|disconnected|ENOTFOUND|EAI_AGAIN/i.test(
    s
  )
}

// Fetch a single activity with full details
export async function fetchActivity(accessToken: string, activityId: number) {
  const maxAttempts = 4
  let lastThrow: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
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
    } catch (e) {
      lastThrow = e
      if (attempt < maxAttempts - 1 && isTransientFetchThrow(e)) {
        await sleep(400 * (attempt + 1))
        continue
      }
      throw e
    }
  }
  throw lastThrow instanceof Error ? lastThrow : new Error('Strava activity fetch failed: exhausted retries')
}

// Fetch photos for an activity
export async function fetchActivityPhotos(accessToken: string, activityId: number): Promise<string[]> {
  const maxAttempts = 8
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${BASE_URL}/activities/${activityId}/photos?photo_sources=true&size=1200`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (resp.ok) {
        const photos = await resp.json()
        return photos.map((p: any) => p.urls?.['1200'] || p.urls?.['600'] || '').filter(Boolean)
      }
      if (resp.status === 429 && attempt < maxAttempts - 1) {
        const ra = resp.headers.get('Retry-After')
        const waitSec = ra ? Math.min(Math.max(parseInt(ra, 10) || 60, 30), 900) : 60 + attempt * 45
        console.warn(
          `Strava 429 on activity ${activityId} photos — sleeping ${waitSec}s (attempt ${attempt + 1}/${maxAttempts})`
        )
        await sleep(waitSec * 1000)
        continue
      }
      return []
    } catch {
      if (attempt < maxAttempts - 1) {
        await sleep(5000 * (attempt + 1))
        continue
      }
      return []
    }
  }
  return []
}

/** Update activity fields (e.g. description). Requires activity:write scope. */
export async function updateActivityDescription(
  accessToken: string,
  activityId: number,
  description: string,
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/activities/${activityId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(
      `Strava activity update failed: ${resp.status}${body ? ` — ${body.slice(0, 200)}` : ''}`.trim(),
    )
  }
}

/**
 * Fi collar / Chilli walks. Strava title usually contains "Chilli" and/or "Fi Smart Collar".
 * Do not use naive substring `"fi"` — it matches inside unrelated words ("office", "fitness", …).
 */
export function isChilliActivity(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.includes('chilli')) return true
  if (/\bfi\b/.test(lower)) return true
  if (lower.includes('fi smart') || lower.includes('fi collar')) return true
  return false
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
