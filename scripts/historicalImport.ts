/**
 * Historical import script
 * Run with: npm run import
 *
 *   npm run import                              # since Nov 2023 (full backfill)
 *   npm run import -- --today                  # LA calendar day only
 *   npm run import -- --date 2026-05-04        # one LA calendar day
 *
 * Safe to run multiple times — skips activities that already have a journal row.
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import {
  fetchAllActivities,
  fetchActivityPhotos,
  isChilliActivity,
  getValidAccessToken,
} from '../lib/strava'
import { laDayBoundsUtc, laTodayYmd } from '../lib/laCalendar'
import { getHistoricalWeather } from '../lib/weather'
import { generateJournalEntry } from '../lib/generateEntry'
import { normalizeStartLatLng } from '../lib/geo'
import { getHomeCoordsFromEnv } from '../lib/homeCoords'
import { resolveActivityPlaceNames } from '../lib/reverseGeocode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (e.message?.includes('429')) {
        const wait = (i + 1) * 10000 // 10s, 20s, 30s
        console.log(`  Rate limited — waiting ${wait / 1000}s before retry ${i + 1}/${retries}...`)
        await sleep(wait)
      } else {
        throw e
      }
    }
  }
  throw new Error('Max retries exceeded')
}

type ImportScope = { mode: 'full' } | { mode: 'day'; ymd: string }

function parseArgs(): ImportScope {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') {
      console.log(`
Usage: npm run import -- [options]

  (default)     Import Chilli/Fi activities from Strava since Nov 2023
  --today       Only America/Los_Angeles calendar day (today in Truckee time)
  --date Y-M-D  Only that calendar day in America/Los_Angeles
`)
      process.exit(0)
    }
    if (a === '--today') return { mode: 'day', ymd: laTodayYmd() }
    if (a === '--date') {
      const ymd = argv[++i]
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        throw new Error('--date expects YYYY-MM-DD')
      }
      return { mode: 'day', ymd }
    }
  }
  return { mode: 'full' }
}

async function main() {
  const scope = parseArgs()

  console.log('🐺 Chilli Historical Import Starting...\n')

  let accessToken: string
  try {
    accessToken = await getValidAccessToken()
    console.log('✓ Strava connected\n')
  } catch (e) {
    console.error('✗ Strava not connected. Please connect Strava via the app first.')
    process.exit(1)
  }

  const { data: existingEntries } = await supabaseAdmin
    .from('journal_entries')
    .select('activity_id')
  const existingEntryActivityIds = new Set((existingEntries || []).map((e: any) => e.activity_id))
  console.log(`Already journaled: ${existingEntryActivityIds.size} activities`)

  let afterSec: number
  let beforeSec: number | undefined
  let dayStartMs: number | undefined
  let dayEndMs: number | undefined

  if (scope.mode === 'day') {
    const { start, end } = laDayBoundsUtc(scope.ymd)
    dayStartMs = new Date(start).getTime()
    dayEndMs = new Date(end).getTime()
    afterSec = Math.floor(dayStartMs / 1000)
    beforeSec = Math.floor(dayEndMs / 1000)
    console.log(`\nScope: single LA day ${scope.ymd}`)
    console.log(`UTC window [start, end): ${start} .. ${end}\n`)
    console.log('Fetching Strava activities in this window only...')
  } else {
    afterSec = Math.floor(new Date('2023-11-01').getTime() / 1000)
    console.log('\nFetching Strava activities since Nov 2023 (full list from API)...')
  }

  const allActivities = await fetchAllActivities(accessToken, afterSec, beforeSec)
  console.log(`Strava returned ${allActivities.length} activities (all sports/titles).`)

  let chilliActivities = allActivities.filter(a => isChilliActivity(a.name))

  if (scope.mode === 'day' && dayStartMs !== undefined && dayEndMs !== undefined) {
    chilliActivities = chilliActivities.filter(a => {
      const t = new Date(a.start_date).getTime()
      return t >= dayStartMs && t < dayEndMs
    })
  }

  console.log(`After Chilli/Fi title filter: ${chilliActivities.length} — only those are imported.\n`)

  if (chilliActivities.length === 0) {
    console.log('No Chilli activities found for this run.')
    process.exit(0)
  }

  let imported = 0,
    skipped = 0,
    errors = 0

  for (const activity of chilliActivities) {
    if (existingEntryActivityIds.has(activity.id)) {
      skipped++
      continue
    }

    try {
      console.log(`Processing: ${activity.name} (${new Date(activity.start_date).toDateString()})`)

      const totalPhotoCount = Number(activity.total_photo_count || 0)
      const photoUrls = totalPhotoCount > 0
        ? await fetchWithRetry(() => fetchActivityPhotos(accessToken, activity.id))
        : []
      if (totalPhotoCount > 0) await sleep(500)

      const rawLat = activity.start_latlng?.[0]
      const rawLng = activity.start_latlng?.[1]
      const home = getHomeCoordsFromEnv()
      const { lat, lng } = normalizeStartLatLng(rawLat, rawLng, home)
      let weather = null
      if (lat != null && lng != null) {
        weather = await getHistoricalWeather(lat, lng, new Date(activity.start_date))
      }

      const { data: existingAct } = await supabaseAdmin
        .from('activities')
        .select('city, country, region')
        .eq('id', activity.id)
        .maybeSingle()
      const stravaCity = activity.location_city || existingAct?.city || null
      const stravaCountry = activity.location_country || existingAct?.country || null
      const place = await resolveActivityPlaceNames(
        lat,
        lng,
        stravaCity,
        stravaCountry,
        existingAct?.region ?? null
      )
      if (place.geocoded) await sleep(1100)

      const activityRecord = {
        id: activity.id,
        strava_id: activity.id,
        name: activity.name,
        start_date: activity.start_date,
        distance_meters: activity.distance,
        moving_time_seconds: activity.moving_time,
        elapsed_time_seconds: activity.elapsed_time,
        total_elevation_gain: activity.total_elevation_gain,
        sport_type: activity.sport_type || activity.type,
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
        map_polyline: activity.map?.summary_polyline || null,
      }

      const { error: actError } = await supabaseAdmin
        .from('activities')
        .upsert(activityRecord)
      if (actError) throw actError

      console.log(`  → Generating Chilli's journal entry...`)
      const entry = await generateJournalEntry(activityRecord as any, undefined, photoUrls)
      await sleep(500)

      const { error: entryError } = await supabaseAdmin
        .from('journal_entries')
        .insert({
          activity_id: activity.id,
          title: entry.title,
          entry: entry.entry,
          tags: entry.tags,
          mood: entry.mood,
        })
      if (entryError) throw entryError

      console.log(`  ✓ "${entry.title}" [${entry.mood}]`)
      imported++
    } catch (e) {
      console.error(`  ✗ Error processing activity ${activity.id}:`, e)
      errors++
    }
  }

  console.log(`\n🐾 Import complete!`)
  console.log(`  Imported: ${imported}`)
  console.log(`  Skipped (already exists): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

main().catch(console.error)
