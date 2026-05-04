import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken, fetchActivity, fetchActivityPhotos, isChilliActivity } from '@/lib/strava'
import { getHistoricalWeather } from '@/lib/weather'
import { generateJournalEntry } from '@/lib/generateEntry'
import { logWebhookIngest } from '@/lib/webhookLog'
import { normalizeStartLatLng } from '@/lib/geo'
import { getHomeCoordsFromEnv } from '@/lib/homeCoords'
import { resolveActivityPlaceNames } from '@/lib/reverseGeocode'

export const maxDuration = 120

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN

function parseOptionalFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

// Strava webhook verification (GET) — Strava calls this when you register the webhook
export async function GET(request: NextRequest) {
  if (!VERIFY_TOKEN) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Strava webhook verified')
    void logWebhookIngest({
      stage: 'verification_ok',
      detail: 'hub.challenge issued',
      meta: challenge ? { has_challenge: true } : {},
    })
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Strava webhook event (POST) — fires when a new activity is created
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    void logWebhookIngest({
      stage: 'error',
      detail: 'invalid_json_body',
      error_message: 'POST body was not valid JSON',
    })
    return NextResponse.json({ ok: true })
  }

  console.log('Strava webhook event:', {
    object_type: body.object_type,
    aspect_type: body.aspect_type,
    object_id: body.object_id,
    owner_id: body.owner_id,
  })

  // Only process new activity creation events
  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    void logWebhookIngest({
      stage: 'ignored_event',
      detail: 'not_activity_create',
      meta: {
        object_type: body.object_type,
        aspect_type: body.aspect_type,
        object_id: body.object_id,
      },
    })
    return NextResponse.json({ ok: true })
  }

  const rawId = body.object_id
  const activityId =
    typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string'
        ? Number(rawId)
        : NaN
  const ownerId = parseOptionalFiniteNumber(body.owner_id)

  if (!Number.isFinite(activityId)) {
    void logWebhookIngest({
      stage: 'error',
      detail: 'missing_or_invalid_object_id',
      meta: { object_type: body.object_type, aspect_type: body.aspect_type },
    })
    return NextResponse.json({ ok: true })
  }

  void logWebhookIngest({
    strava_activity_id: activityId,
    strava_owner_id: ownerId ?? null,
    stage: 'received',
    detail: 'activity_create',
  })

  try {
    await processNewActivity(activityId, ownerId)
  } catch (e) {
    // Still return 200 so Strava doesn't wedge retries on transport-ish failures; durable log below.
    console.error(`Failed to process activity ${activityId}:`, e)
    const msg = e instanceof Error ? e.message : String(e)
    void logWebhookIngest({
      strava_activity_id: activityId,
      strava_owner_id: ownerId ?? null,
      stage: 'error',
      detail: 'processNewActivity threw',
      error_message: msg,
    })
  }

  return NextResponse.json({ ok: true })
}

async function processNewActivity(activityId: number, ownerId?: number) {
  try {
    const accessToken = await getValidAccessToken()
    const fullActivity = await fetchActivity(accessToken, activityId)

    if (ownerId) {
      const { data: tokenRow } = await supabaseAdmin
        .from('strava_tokens')
        .select('athlete_id')
        .eq('id', 1)
        .single()

      if (tokenRow?.athlete_id && tokenRow.athlete_id !== ownerId) {
        console.log(`Ignoring webhook for owner_id=${ownerId} (expected athlete_id=${tokenRow.athlete_id})`)
        void logWebhookIngest({
          strava_activity_id: activityId,
          strava_owner_id: ownerId ?? null,
          stage: 'skipped_owner',
          detail: 'owner_id mismatch',
          meta: { expected_athlete_id: tokenRow.athlete_id, got_owner_id: ownerId },
        })
        return
      }
    }

    // Only process Chilli activities
    if (!isChilliActivity(fullActivity.name)) {
      console.log(`Skipping non-Chilli activity: ${fullActivity.name}`)
      void logWebhookIngest({
        strava_activity_id: activityId,
        strava_owner_id: ownerId ?? null,
        stage: 'skipped_filter',
        detail: 'not_chilli_activity',
        meta: { name: fullActivity.name },
      })
      return
    }

    console.log(`New Chilli activity detected: ${fullActivity.name}`)

    const { data: existingEntry } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('activity_id', activityId)
      .maybeSingle()

    if (existingEntry) {
      console.log(`Journal entry already exists for activity ${activityId}, skipping`)
      void logWebhookIngest({
        strava_activity_id: activityId,
        strava_owner_id: ownerId ?? null,
        stage: 'skipped_duplicate_journal',
        detail: 'journal_entries row exists',
      })
      return
    }

    const { data: existingActivity } = await supabaseAdmin
      .from('activities')
      .select('id, city, country, region')
      .eq('strava_id', activityId)
      .maybeSingle()

    if (existingActivity) {
      console.warn(`Activity ${activityId} exists in DB but journal is missing — generating journal`)
    }

    const totalPhotoCount = Number(fullActivity.total_photo_count || 0)
    const photoUrls = totalPhotoCount > 0
      ? await fetchActivityPhotos(accessToken, activityId)
      : []

    const rawLat = fullActivity.start_latlng?.[0]
    const rawLng = fullActivity.start_latlng?.[1]
    const home = getHomeCoordsFromEnv()
    const { lat, lng } = normalizeStartLatLng(rawLat, rawLng, home)
    const weather =
      lat != null && lng != null
        ? await getHistoricalWeather(lat, lng, new Date(fullActivity.start_date))
        : null

    const stravaCity = fullActivity.location_city || existingActivity?.city || null
    const stravaCountry = fullActivity.location_country || existingActivity?.country || null
    const place = await resolveActivityPlaceNames(
      lat,
      lng,
      stravaCity,
      stravaCountry,
      existingActivity?.region ?? null
    )

    const activityRecord = {
      id: fullActivity.id,
      strava_id: fullActivity.id,
      name: fullActivity.name,
      start_date: fullActivity.start_date,
      distance_meters: fullActivity.distance,
      moving_time_seconds: fullActivity.moving_time,
      elapsed_time_seconds: fullActivity.elapsed_time,
      total_elevation_gain: fullActivity.total_elevation_gain,
      sport_type: fullActivity.sport_type || fullActivity.type,
      start_lat: lat,
      start_lng: lng,
      city: place.city,
      region: place.region,
      country: place.country,
      weather_temp_c: weather?.temp_c ?? null,
      weather_condition: weather?.condition ?? null,
      weather_wind_kmh: weather?.wind_kmh ?? null,
      weather_precipitation_mm: weather?.precipitation_mm ?? null,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
      map_polyline: fullActivity.map?.summary_polyline || null,
    }

    const hadActivityBefore = !!existingActivity

    const { error: actError } = await supabaseAdmin
      .from('activities')
      .upsert(activityRecord)
    if (actError) throw actError

    let entry: Awaited<ReturnType<typeof generateJournalEntry>>
    try {
      // Generate journal entry
      entry = await generateJournalEntry(activityRecord as any, undefined, photoUrls)
    } catch (e) {
      if (!hadActivityBefore) {
        await supabaseAdmin.from('activities').delete().eq('id', fullActivity.id)
      }
      throw e
    }

    const { error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        activity_id: fullActivity.id,
        title: entry.title,
        entry: entry.entry,
        tags: entry.tags,
        mood: entry.mood,
      })
    if (entryError) {
      // If we just created the activity row and journal generation/insert failed, roll back the activity
      // so a future webhook retry can try again (avoids "activity exists but no journal" orphans).
      if (!hadActivityBefore) {
        await supabaseAdmin.from('activities').delete().eq('id', fullActivity.id)
      }
      throw entryError
    }

    console.log(`✓ Auto-generated entry for new Chilli activity: "${entry.title}" [${entry.mood}]`)
    void logWebhookIngest({
      strava_activity_id: activityId,
      strava_owner_id: ownerId ?? null,
      stage: 'success',
      detail: 'journal_created',
      meta: { title: entry.title, mood: entry.mood },
    })
  } catch (e) {
    console.error('Error processing new activity:', e)
    throw e
  }
}
