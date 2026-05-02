import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken, fetchActivity, fetchActivityPhotos, isChilliActivity } from '@/lib/strava'
import { getHistoricalWeather } from '@/lib/weather'
import { generateJournalEntry } from '@/lib/generateEntry'

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN

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
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Strava webhook event (POST) — fires when a new activity is created
export async function POST(request: NextRequest) {
  const body = await request.json()
  console.log('Strava webhook event:', { object_type: body.object_type, aspect_type: body.aspect_type, object_id: body.object_id, owner_id: body.owner_id })

  // Only process new activity creation events
  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  const activityId = body.object_id as number

  const work = processNewActivity(activityId, body.owner_id as number | undefined).catch(e =>
    console.error(`Failed to process activity ${activityId}:`, e)
  )

  // On Vercel/serverless, respond quickly but keep work alive until completion.
  if (process.env.VERCEL) {
    waitUntil(work)
  } else {
    // Local dev: keep the Node process from exiting mid-work (still best-effort).
    void work
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
        return
      }
    }

    // Only process Chilli activities
    if (!isChilliActivity(fullActivity.name)) {
      console.log(`Skipping non-Chilli activity: ${fullActivity.name}`)
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
      return
    }

    const totalPhotoCount = Number(fullActivity.total_photo_count || 0)
    const photoUrls = totalPhotoCount > 0
      ? await fetchActivityPhotos(accessToken, activityId)
      : []

    const lat = fullActivity.start_latlng?.[0]
    const lng = fullActivity.start_latlng?.[1]
    const weather = lat && lng
      ? await getHistoricalWeather(lat, lng, new Date(fullActivity.start_date))
      : null

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
      start_lat: lat || null,
      start_lng: lng || null,
      city: fullActivity.location_city || null,
      country: fullActivity.location_country || null,
      weather_temp_c: weather?.temp_c ?? null,
      weather_condition: weather?.condition ?? null,
      weather_wind_kmh: weather?.wind_kmh ?? null,
      weather_precipitation_mm: weather?.precipitation_mm ?? null,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
      map_polyline: fullActivity.map?.summary_polyline || null,
    }

    // Save activity
    const { error: actError } = await supabaseAdmin
      .from('activities')
      .upsert(activityRecord)
    if (actError) throw actError

    // Generate journal entry
    const entry = await generateJournalEntry(activityRecord as any, undefined, photoUrls)

    const { error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        activity_id: fullActivity.id,
        title: entry.title,
        entry: entry.entry,
        tags: entry.tags,
        mood: entry.mood,
      })
    if (entryError) throw entryError

    console.log(`✓ Auto-generated entry for new Chilli activity: "${entry.title}" [${entry.mood}]`)
  } catch (e) {
    console.error('Error processing new activity:', e)
    throw e
  }
}
