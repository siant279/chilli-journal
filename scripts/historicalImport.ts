/**
 * Historical import script
 * Run with: npm run import
 *
 * This script:
 * 1. Fetches ALL your Strava activities
 * 2. Filters for Chilli's Fi collar walks
 * 3. Fetches weather data for each
 * 4. Generates AI journal entries
 * 5. Saves everything to Supabase
 *
 * Safe to run multiple times — skips activities already imported.
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
import { getHistoricalWeather } from '../lib/weather'
import { generateJournalEntry } from '../lib/generateEntry'

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
        console.log(`  Rate limited — waiting ${wait/1000}s before retry ${i+1}/${retries}...`)
        await sleep(wait)
      } else {
        throw e
      }
    }
  }
  throw new Error('Max retries exceeded')
}

async function main() {
  console.log('🐺 Chilli Historical Import Starting...\n')

  let accessToken: string
  try {
    accessToken = await getValidAccessToken()
    console.log('✓ Strava connected\n')
  } catch (e) {
    console.error('✗ Strava not connected. Please connect Strava via the app first.')
    process.exit(1)
  }

  // We treat "imported" as "has a journal entry" so re-runs can fill gaps where
  // an activity row exists but journal generation previously failed.
  const { data: existingEntries } = await supabaseAdmin
    .from('journal_entries')
    .select('activity_id')
  const existingEntryActivityIds = new Set((existingEntries || []).map((e: any) => e.activity_id))
  console.log(`Already journaled: ${existingEntryActivityIds.size} activities`)

  // Only fetch since Nov 2023
  const after = Math.floor(new Date('2023-11-01').getTime() / 1000)
  console.log('Fetching Strava activities since Nov 2023...')
  const allActivities = await fetchAllActivities(accessToken, after)
  console.log(`Total activities since Nov 2023: ${allActivities.length}`)

  const chilliActivities = allActivities.filter(a => isChilliActivity(a.name))
  console.log(`Chilli activities found: ${chilliActivities.length}\n`)

  if (chilliActivities.length === 0) {
    console.log('No Chilli activities found.')
    process.exit(0)
  }

  let imported = 0, skipped = 0, errors = 0

  for (const activity of chilliActivities) {
    if (existingEntryActivityIds.has(activity.id)) {
      skipped++
      continue
    }

    try {
      console.log(`Processing: ${activity.name} (${new Date(activity.start_date).toDateString()})`)

      // Use the list payload as the base record (avoids per-activity detail calls).
      // Only call Strava again if we need photos.
      const totalPhotoCount = Number(activity.total_photo_count || 0)
      const photoUrls = totalPhotoCount > 0
        ? await fetchWithRetry(() => fetchActivityPhotos(accessToken, activity.id))
        : []
      if (totalPhotoCount > 0) await sleep(500)

      const lat = activity.start_latlng?.[0]
      const lng = activity.start_latlng?.[1]
      let weather = null
      if (lat && lng) {
        weather = await getHistoricalWeather(lat, lng, new Date(activity.start_date))
      }

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
        start_lat: lat || null,
        start_lng: lng || null,
        city: activity.location_city || null,
        country: activity.location_country || null,
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
