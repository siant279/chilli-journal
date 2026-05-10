/**
 * Re-fetch Open-Meteo historical weather for activities in a recent window (correct Pacific
 * date/hour indexing), update `activities`, then refresh journal stat headers (and optionally
 * full Claude regeneration).
 *
 *   npm run refetch:weather                    # last 30 days, weather + headers
 *   npm run refetch:weather -- --days 14
 *   npm run refetch:weather -- --dry-run
 *   npm run refetch:weather -- --regenerate --refresh-photos
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { buildEntryStatsHeader, generateJournalEntry } from '../lib/generateEntry'
import { normalizeStartLatLng } from '../lib/geo'
import { getHomeCoordsFromEnv } from '../lib/homeCoords'
import { stripLeadingStatsHeader } from '../lib/journalHeaderReflow'
import type { Activity } from '../lib/supabase'
import { fetchActivityPhotos, getValidAccessToken } from '../lib/strava'
import { getHistoricalWeather, replaceCelsiusWithFahrenheitInText } from '../lib/weather'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = {
    days: 30,
    dryRun: false,
    regenerate: false,
    refreshPhotos: false,
    openMeteoSleepMs: 200,
    claudeSleepMs: 500,
    stravaSleepMs: 400,
    skipHeaders: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--days') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--days must be a positive number')
      out.days = n
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--regenerate') out.regenerate = true
    else if (a === '--refresh-photos') out.refreshPhotos = true
    else if (a === '--skip-headers') out.skipHeaders = true
    else if (a === '--open-meteo-sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--open-meteo-sleep-ms must be non-negative')
      out.openMeteoSleepMs = n
    } else if (a === '--claude-sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--claude-sleep-ms must be non-negative')
      out.claudeSleepMs = n
    } else if (a === '--strava-sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--strava-sleep-ms must be non-negative')
      out.stravaSleepMs = n
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: npm run refetch:weather -- [options]

  (default)              Rolling window: last 30 days of activities (by start_date)
  --days N               Window length in days (default 30)
  --dry-run              Log actions without writing to Supabase
  --skip-headers         Only update activities.weather_*; do not touch journal_entries
  --regenerate           Re-run Claude for every journal in the window (title, entry, tags, mood),
                         using current activity rows (weather + time prompts). Runs even if weather
                         was already correct.
  --refresh-photos       Re-fetch Strava activity photo URLs (all returned sizes 1200px) and
                         update activities.photo_urls. Counts toward Strava rate limits.
  --open-meteo-sleep-ms  Delay between Open-Meteo calls (default 200)
  --strava-sleep-ms      Delay between Strava photo requests (default 400)
  --claude-sleep-ms      Delay between Claude calls when --regenerate (default 500)
`)
      process.exit(0)
    } else {
      throw new Error(`Unknown arg: ${a}`)
    }
  }
  return out
}

function weatherSnapshot(activity: Activity) {
  return {
    t: activity.weather_temp_c,
    c: activity.weather_condition,
    w: activity.weather_wind_kmh,
    p: activity.weather_precipitation_mm,
  }
}

function weatherChanged(activity: Activity, next: NonNullable<Awaited<ReturnType<typeof getHistoricalWeather>>>) {
  const prev = weatherSnapshot(activity)
  return (
    prev.t !== next.temp_c ||
    prev.c !== next.condition ||
    prev.w !== next.wind_kmh ||
    prev.p !== next.precipitation_mm
  )
}

type WeatherRow = NonNullable<Awaited<ReturnType<typeof getHistoricalWeather>>>

function photoUrlsEqual(stored: string[] | null | undefined, next: string[]): boolean {
  const a = stored ?? []
  if (a.length !== next.length) return false
  return a.every((u, i) => u === next[i])
}

function activityWithRefetchedWeather(activity: Activity, w: WeatherRow): Activity {
  return {
    ...activity,
    weather_temp_c: w.temp_c,
    weather_condition: w.condition,
    weather_wind_kmh: w.wind_kmh,
    weather_precipitation_mm: w.precipitation_mm,
  }
}

async function fetchActivitiesSince(cutoffIso: string): Promise<Activity[]> {
  const pageSize = 200
  const all: Activity[] = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('activities')
      .select('*')
      .gte('start_date', cutoffIso)
      .order('start_date', { ascending: false })
      .range(from, to)

    if (error) throw error
    const batch = (data || []) as Activity[]
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

type JournalRow = {
  id: string
  activity_id: number
  entry: string
  human_note: string | null
  title: string
  tags: string[] | null
  mood: string
  activities: Activity | Activity[] | null
}

function normalizeJournalRow(raw: JournalRow): {
  id: string
  activity_id: number
  entry: string
  human_note: string | null
  title: string
  tags: string[] | null
  mood: string
  activity: Activity | null
} {
  let activity: Activity | null = null
  if (Array.isArray(raw.activities)) {
    activity = (raw.activities[0] as Activity | undefined) ?? null
  } else {
    activity = raw.activities
  }
  return {
    id: raw.id,
    activity_id: raw.activity_id,
    entry: raw.entry,
    human_note: raw.human_note,
    title: raw.title,
    tags: raw.tags,
    mood: raw.mood,
    activity,
  }
}

const journalSelectWithActivity = `
        id,
        activity_id,
        title,
        entry,
        tags,
        mood,
        human_note,
        activities (*)
      `

const journalSelectWithActivityInner = `
        id,
        activity_id,
        title,
        entry,
        tags,
        mood,
        human_note,
        activities!inner (*)
      `

async function fetchJournalsForActivities(activityIds: number[]): Promise<
  ReturnType<typeof normalizeJournalRow>[]
> {
  const out: ReturnType<typeof normalizeJournalRow>[] = []
  const chunkSize = 80
  for (let i = 0; i < activityIds.length; i += chunkSize) {
    const chunk = activityIds.slice(i, i + chunkSize)
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(journalSelectWithActivity)
      .in('activity_id', chunk)

    if (error) throw error
    for (const row of data || []) {
      out.push(normalizeJournalRow(row as JournalRow))
    }
  }
  return out
}

/** All journals whose activity started on or after `cutoffIso` (for --regenerate window). */
async function fetchJournalRowsSince(cutoffIso: string): Promise<ReturnType<typeof normalizeJournalRow>[]> {
  const pageSize = 150
  const all: ReturnType<typeof normalizeJournalRow>[] = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(journalSelectWithActivityInner)
      .gte('activities.start_date', cutoffIso)
      .order('id', { ascending: true })
      .range(from, to)

    if (error) throw error
    const batch = data || []
    for (const row of batch) {
      all.push(normalizeJournalRow(row as JournalRow))
    }
    if (batch.length < pageSize) break
  }
  return all
}

async function main() {
  const {
    days,
    dryRun,
    regenerate,
    refreshPhotos,
    openMeteoSleepMs,
    claudeSleepMs,
    stravaSleepMs,
    skipHeaders,
  } = parseArgs()
  if (dryRun && regenerate) {
    console.error('Cannot combine --dry-run with --regenerate (Claude would still be billed).')
    process.exit(1)
  }
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  console.log(
    `Refetch: last ${days} days (start_date >= ${cutoffIso})` +
      `${refreshPhotos ? ' + Strava photos' : ''}${dryRun ? ' [DRY RUN]' : ''}\n`
  )

  const activities = await fetchActivitiesSince(cutoffIso)
  console.log(`Loaded ${activities.length} activities in window\n`)

  const home = getHomeCoordsFromEnv()
  let weatherUpdated = 0,
    weatherSkipped = 0,
    weatherFailed = 0,
    noCoords = 0

  const activityIdsTouched: number[] = []
  /** Dry-run only: simulated weather after refetch (DB row is not updated yet). */
  const dryRunWeatherByActivityId = new Map<number, WeatherRow>()

  for (const act of activities) {
    const { lat, lng } = normalizeStartLatLng(act.start_lat, act.start_lng, home)
    if (lat == null || lng == null) {
      noCoords++
      console.warn(`  ⚠ activity ${act.id}: no start coordinates, skip weather`)
      continue
    }

    let weather: Awaited<ReturnType<typeof getHistoricalWeather>>
    try {
      weather = await getHistoricalWeather(lat, lng, new Date(act.start_date))
    } catch (e) {
      console.error(`  ✗ activity ${act.id}: Open-Meteo error`, e)
      weatherFailed++
      continue
    }

    if (!weather) {
      console.warn(`  ⚠ activity ${act.id}: no weather returned`)
      weatherFailed++
      await sleep(openMeteoSleepMs)
      continue
    }

    if (!weatherChanged(act, weather)) {
      weatherSkipped++
      await sleep(openMeteoSleepMs)
      continue
    }

    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from('activities')
        .update({
          weather_temp_c: weather.temp_c,
          weather_condition: weather.condition,
          weather_wind_kmh: weather.wind_kmh,
          weather_precipitation_mm: weather.precipitation_mm,
          updated_at: new Date().toISOString(),
        })
        .eq('id', act.id)
      if (error) throw error
    }

    console.log(
      `${dryRun ? '  ◇ [dry-run]' : '  ✓'} activity ${act.id}: weather → ${weather.condition}, ${weather.temp_c}°C (was ${act.weather_temp_c ?? '—'}°C)`
    )
    weatherUpdated++
    activityIdsTouched.push(act.id)
    if (dryRun) dryRunWeatherByActivityId.set(act.id, weather)
    await sleep(openMeteoSleepMs)
  }

  console.log(
    `\nWeather pass: updated=${weatherUpdated} unchanged=${weatherSkipped} failed=${weatherFailed} no_coords=${noCoords}\n`
  )

  let photosUpdated = 0,
    photosSkipped = 0,
    photosWarn = 0

  if (refreshPhotos) {
    if (dryRun) {
      console.log(
        `Photo pass [DRY RUN]: would request Strava /photos for ${activities.length} activities (use without --dry-run).\n`
      )
    } else {
      let accessToken: string
      try {
        accessToken = await getValidAccessToken()
      } catch (e) {
        console.error('Cannot --refresh-photos without Strava tokens. Connect Strava in the app first.', e)
        process.exit(1)
      }
      console.log(`Photo pass: Strava /activities/{id}/photos for ${activities.length} activities\n`)

      for (const act of activities) {
        try {
          const urls = await fetchActivityPhotos(accessToken, act.id)
          const hadStored = (act.photo_urls?.length ?? 0) > 0

          if (urls.length === 0) {
            if (hadStored) {
              console.warn(
                `  ⚠ activity ${act.id}: Strava returned no photo URLs (rate limit or API error?); keeping stored URLs`
              )
              photosWarn++
            } else {
              photosSkipped++
            }
            await sleep(stravaSleepMs)
            continue
          }

          if (photoUrlsEqual(act.photo_urls, urls)) {
            photosSkipped++
            await sleep(stravaSleepMs)
            continue
          }

          const { error } = await supabaseAdmin
            .from('activities')
            .update({
              photo_urls: urls,
              updated_at: new Date().toISOString(),
            })
            .eq('id', act.id)
          if (error) throw error

          console.log(`  ✓ activity ${act.id}: ${urls.length} photo URL(s)`)
          photosUpdated++
        } catch (e) {
          console.error(`  ✗ activity ${act.id}: photo refetch failed`, e)
          photosWarn++
        }
        await sleep(stravaSleepMs)
      }

      console.log(
        `\nPhoto pass: updated=${photosUpdated} unchanged_or_empty=${photosSkipped} issues=${photosWarn}\n`
      )
    }
  }

  if (skipHeaders) {
    console.log('Skipped journal header / Claude steps (--skip-headers).')
    return
  }

  if (!regenerate && activityIdsTouched.length === 0) {
    console.log(
      refreshPhotos && !dryRun && photosUpdated > 0
        ? `No weather field changes. Photo URLs refreshed on ${photosUpdated} activities. Skipping journal headers (stats block has no photo lines).`
        : 'No weather changes; done.'
    )
    return
  }

  const journalRows = regenerate
    ? await fetchJournalRowsSince(cutoffIso)
    : await fetchJournalsForActivities(activityIdsTouched)

  console.log(
    `${regenerate ? 'Journal rows in window (regenerate all)' : 'Journal rows for touched activities'}: ${journalRows.length}\n`
  )

  let headersUpdated = 0,
    headersSkipped = 0,
    regenUpdated = 0,
    journalErrors = 0

  for (const row of journalRows) {
    try {
      const activity = row.activity
      if (!activity) {
        console.warn(`⚠ journal ${row.id}: missing activity join`)
        journalErrors++
        continue
      }

      const activityForAi =
        dryRun && dryRunWeatherByActivityId.has(row.activity_id)
          ? activityWithRefetchedWeather(activity, dryRunWeatherByActivityId.get(row.activity_id)!)
          : activity

      if (regenerate) {
        const photoUrls =
          activity.photo_urls && activity.photo_urls.length > 0 ? activity.photo_urls : undefined
        const generated = await generateJournalEntry(
          activityForAi,
          row.human_note || undefined,
          photoUrls
        )

        if (!dryRun) {
          const { error } = await supabaseAdmin
            .from('journal_entries')
            .update({
              title: generated.title,
              entry: generated.entry,
              tags: generated.tags,
              mood: generated.mood,
            })
            .eq('id', row.id)
          if (error) throw error
        }
        console.log(
          `${dryRun ? '  ◇ [dry-run]' : '  ✓'} journal ${row.id}: ${dryRun ? 'would regenerate' : 'regenerated'} "${generated.title}"`
        )
        regenUpdated++
        await sleep(claudeSleepMs)
        continue
      }

      const header = buildEntryStatsHeader(activityForAi)
      if (!header) {
        headersSkipped++
        continue
      }

      const bodyRaw = stripLeadingStatsHeader(row.entry)
      const body = replaceCelsiusWithFahrenheitInText(bodyRaw)
      const newEntry = `${header}\n\n${body}`.trimEnd()

      if (newEntry === row.entry.trimEnd()) {
        headersSkipped++
        continue
      }

      if (!dryRun) {
        const { error } = await supabaseAdmin.from('journal_entries').update({ entry: newEntry }).eq('id', row.id)
        if (error) throw error
      }
      console.log(
        `${dryRun ? '  ◇ [dry-run]' : '  ✓'} journal ${row.id}: ${dryRun ? 'would refresh header' : 'header refreshed'}`
      )
      headersUpdated++
    } catch (e) {
      console.error(`✗ journal ${row.id}:`, e)
      journalErrors++
    }
  }

  const headerUpdatedLabel = dryRun ? 'journal_headers_would_update' : 'journal_headers_updated'
  const photoSummary = refreshPhotos ? ` photos_refreshed=${photosUpdated}` : ''
  console.log(
    `\nDone. weather_rows_${dryRun ? 'would_update' : 'updated'}=${weatherUpdated}${photoSummary} ` +
      (regenerate
        ? `claude_regenerated=${regenUpdated} journal_errors=${journalErrors}`
        : `${headerUpdatedLabel}=${headersUpdated} journal_headers_unchanged=${headersSkipped} journal_errors=${journalErrors}`)
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
