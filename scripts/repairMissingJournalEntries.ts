/**
 * Repair activities that exist in Supabase but have no journal_entries row
 * (so they won't appear in entries_with_stats / the UI).
 *
 *   npm run repair:journals
 *   npm run repair:journals -- --since 2026-05-01 --limit 20 --dry-run
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import type { Activity } from '../lib/supabase'
import { generateJournalEntry } from '../lib/generateEntry'
import { fetchActivityPhotos, getValidAccessToken, isChilliActivity } from '../lib/strava'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = {
    dryRun: false,
    limit: Infinity as number,
    since: null as Date | null,
    sleepMs: 500,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--limit must be a positive number')
      out.limit = n
    } else if (a === '--since') {
      const d = new Date(argv[++i])
      if (Number.isNaN(d.getTime())) throw new Error('--since must be a parseable date')
      out.since = d
    } else if (a === '--sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--sleep-ms must be a non-negative number')
      out.sleepMs = n
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: npm run repair:journals -- [options]

Options:
  --since YYYY-MM-DD   Only consider activities on/after this local-date parse
  --limit N            Process at most N missing rows
  --dry-run            Log only
  --sleep-ms N         Delay after each Claude call (default 500)
`)
      process.exit(0)
    } else {
      throw new Error(`Unknown arg: ${a}`)
    }
  }
  return out
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toActivity(row: any): Activity {
  const num = (v: any, fallback = 0) => (v === null || v === undefined ? fallback : Number(v))
  return {
    id: num(row.id),
    strava_id: num(row.strava_id),
    name: String(row.name),
    start_date: String(row.start_date),
    distance_meters: num(row.distance_meters, 0),
    moving_time_seconds: num(row.moving_time_seconds, 0),
    elapsed_time_seconds: num(row.elapsed_time_seconds, 0),
    total_elevation_gain: num(row.total_elevation_gain, 0),
    sport_type: row.sport_type ? String(row.sport_type) : '',
    start_lat: row.start_lat === null || row.start_lat === undefined ? null : Number(row.start_lat),
    start_lng: row.start_lng === null || row.start_lng === undefined ? null : Number(row.start_lng),
    city: row.city ?? null,
    country: row.country ?? null,
    weather_temp_c: row.weather_temp_c === null || row.weather_temp_c === undefined ? null : Number(row.weather_temp_c),
    weather_condition: row.weather_condition ?? null,
    weather_wind_kmh: row.weather_wind_kmh === null || row.weather_wind_kmh === undefined ? null : Number(row.weather_wind_kmh),
    weather_precipitation_mm:
      row.weather_precipitation_mm === null || row.weather_precipitation_mm === undefined
        ? null
        : Number(row.weather_precipitation_mm),
    photo_urls: row.photo_urls ?? null,
    map_polyline: row.map_polyline ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }
}

async function loadJournaledActivityIds(): Promise<Set<number>> {
  const pageSize = 1000
  const ids = new Set<number>()
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin.from('journal_entries').select('activity_id').range(from, to)
    if (error) throw error
    const batch = data || []
    for (const r of batch) ids.add(Number((r as any).activity_id))
    if (batch.length < pageSize) break
  }
  return ids
}

async function main() {
  const { dryRun, limit, since, sleepMs } = parseArgs()
  console.log(`Repair missing journals starting${dryRun ? ' [DRY RUN]' : ''}\n`)

  const accessToken = await getValidAccessToken()
  const journaled = await loadJournaledActivityIds()
  console.log(`Journal entries found: ${journaled.size}`)

  const pageSize = 200
  let repaired = 0,
    skipped = 0,
    scanned = 0

  outer: for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    let q = supabaseAdmin.from('activities').select('*').order('start_date', { ascending: false }).range(from, to)
    if (since) {
      q = q.gte('start_date', since.toISOString())
    }
    const { data, error } = await q
    if (error) throw error
    const batch = data || []
    if (!batch.length) break

    for (const raw of batch) {
      scanned++
      const row = raw as any
      const activityId = Number(row.id)
      if (journaled.has(activityId)) {
        skipped++
        continue
      }
      if (!isChilliActivity(String(row.name))) {
        skipped++
        continue
      }

      const activity = toActivity(row)

      let photoUrls: string[] = Array.isArray(activity.photo_urls) ? activity.photo_urls : []
      if (photoUrls.length === 0) {
        // Best-effort: try Strava photos endpoint (cheap no-op if none)
        photoUrls = await fetchActivityPhotos(accessToken, activity.strava_id)
      }

      console.log(`Missing journal for activity ${activity.strava_id}: ${activity.name}`)

      if (dryRun) {
        repaired++
        if (repaired >= limit) break outer
        continue
      }

      const entry = await generateJournalEntry(activity, undefined, photoUrls)
      const { error: insErr } = await supabaseAdmin.from('journal_entries').insert({
        activity_id: activity.id,
        title: entry.title,
        entry: entry.entry,
        tags: entry.tags,
        mood: entry.mood,
      })
      if (insErr) throw insErr

      journaled.add(activity.id)
      repaired++
      await sleep(sleepMs)

      if (repaired >= limit) break outer
    }

    if (batch.length < pageSize) break
  }

  console.log(`\nDone. repaired=${repaired} skipped=${skipped} scanned=${scanned}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
