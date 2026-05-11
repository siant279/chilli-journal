/**
 * Re-fetch Open-Meteo historical weather for activities in a recent window (correct Pacific
 * date/hour indexing), update `activities`, then refresh journal stat headers (and optionally
 * full Claude regeneration).
 *
 *   npm run refetch:weather                    # last 30 days, weather + headers
 *   npm run refetch:weather -- --days 14
 *   npm run refetch:weather -- --dry-run
 *   npm run refetch:weather -- --regenerate --refresh-photos
 *   npm run refetch:weather -- --verbose --progress-every 10
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { buildEntryStatsHeader, generateJournalEntry } from '../lib/generateEntry'
import { resolveWeatherCoords } from '../lib/geo'
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

function isoNow() {
  return new Date().toISOString()
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
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
    /** Strava: ~100 req / 15 min — default spacing safe for bulk photo refresh. */
    stravaSleepMs: 10_000,
    skipHeaders: false,
    /** Log every activity/photo/journal line (noisy). */
    verbose: false,
    /** Progress + ETA every N rows (0 = off). */
    progressEvery: 25,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--days') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--days must be a positive number')
      out.days = n
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--verbose' || a === '-v') out.verbose = true
    else if (a === '--regenerate') out.regenerate = true
    else if (a === '--refresh-photos') out.refreshPhotos = true
    else if (a === '--skip-headers') out.skipHeaders = true
    else if (a === '--progress-every') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--progress-every must be a non-negative number (0 disables)')
      out.progressEvery = n
    }
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
  --strava-sleep-ms      Delay between Strava photo requests (default 10000 ≈ 100/15min limit)
  --claude-sleep-ms      Delay between Claude calls when --regenerate (default 500)
  --verbose, -v          Log each activity weather source, skips, and journal context (very chatty)
  --progress-every N     Log progress + ETA every N rows per phase (default 25, 0 = off)
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
async function fetchJournalRowsSince(
  cutoffIso: string,
  opts?: { verbose?: boolean }
): Promise<ReturnType<typeof normalizeJournalRow>[]> {
  const pageSize = 150
  const all: ReturnType<typeof normalizeJournalRow>[] = []
  let page = 0
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
    page++
    if (opts?.verbose) {
      console.log(`[${isoNow()}] fetch journals page ${page}: +${batch.length} rows (total so far ${all.length + batch.length})`)
    }
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
    verbose,
    progressEvery,
  } = parseArgs()
  if (dryRun && regenerate) {
    console.error('Cannot combine --dry-run with --regenerate (Claude would still be billed).')
    process.exit(1)
  }
  const runStarted = Date.now()
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  console.log(
    `[${isoNow()}] Run start | days=${days} regenerate=${regenerate} refreshPhotos=${refreshPhotos} ` +
      `dryRun=${dryRun} verbose=${verbose} progressEvery=${progressEvery} ` +
      `sleeps(ms): openMeteo=${openMeteoSleepMs} strava=${stravaSleepMs} claude=${claudeSleepMs}`
  )
  console.log(
    `Refetch: last ${days} days (start_date >= ${cutoffIso})` +
      `${refreshPhotos ? ' + Strava photos' : ''}${dryRun ? ' [DRY RUN]' : ''}\n`
  )

  const activities = await fetchActivitiesSince(cutoffIso)
  console.log(
    `[${isoNow()}] Loaded ${activities.length} activities in window (${fmtDuration(Date.now() - runStarted)} elapsed)`
  )
  if (verbose && activities.length) {
    const newest = activities[0]
    const oldest = activities[activities.length - 1]
    console.log(
      `  activity date range: ${oldest?.start_date ?? '?'} … ${newest?.start_date ?? '?'} (list ordered newest-first)`
    )
  }

  const home = getHomeCoordsFromEnv()
  console.log(
    `[${isoNow()}] Coords fallback: HOME_LAT/HOME_LNG ${home ? `set (${home.lat}, ${home.lng})` : 'not set — home weather fallback disabled'}`
  )

  let weatherUpdated = 0,
    weatherSkipped = 0,
    weatherFailed = 0,
    noCoords = 0,
    weatherUsedStart = 0,
    weatherUsedPolyline = 0,
    weatherUsedHome = 0,
    startCoordsBackfilled = 0

  const activityIdsTouched: number[] = []
  /** Dry-run only: simulated weather after refetch (DB row is not updated yet). */
  const dryRunWeatherByActivityId = new Map<number, WeatherRow>()

  const weatherPassStarted = Date.now()
  const totalActs = activities.length
  for (let idx = 0; idx < activities.length; idx++) {
    const act = activities[idx]
    const wx = resolveWeatherCoords(
      {
        start_lat: act.start_lat,
        start_lng: act.start_lng,
        map_polyline: act.map_polyline,
      },
      home
    )
    if (!wx) {
      noCoords++
      console.warn(
        `  ⚠ activity ${act.id}: no coordinates (set HOME_LAT/HOME_LNG in .env.local for Truckee fallback), skip weather`
      )
      continue
    }
    if (wx.source === 'start') weatherUsedStart++
    if (wx.source === 'polyline') weatherUsedPolyline++
    if (wx.source === 'home') weatherUsedHome++

    if (verbose) {
      const hasPoly = !!(act.map_polyline && act.map_polyline.length > 0)
      console.log(
        `  [weather] id=${act.id} src=${wx.source} start=${act.start_date} ` +
          `stored=(${act.start_lat ?? '—'},${act.start_lng ?? '—'}) poly=${hasPoly} | ${(act.name || '').slice(0, 70)}`
      )
    }

    if (
      !dryRun &&
      wx.source === 'polyline' &&
      (act.start_lat == null || act.start_lng == null)
    ) {
      const { error: coordErr } = await supabaseAdmin
        .from('activities')
        .update({
          start_lat: wx.lat,
          start_lng: wx.lng,
          updated_at: new Date().toISOString(),
        })
        .eq('id', act.id)
      if (coordErr) throw coordErr
      act.start_lat = wx.lat
      act.start_lng = wx.lng
      startCoordsBackfilled++
      if (verbose) {
        console.log(`  [weather] id=${act.id} backfilled start_lat/start_lng from polyline → (${wx.lat}, ${wx.lng})`)
      }
    }

    let weather: Awaited<ReturnType<typeof getHistoricalWeather>>
    try {
      weather = await getHistoricalWeather(wx.lat, wx.lng, new Date(act.start_date))
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
      if (verbose) {
        console.log(
          `  [weather] id=${act.id} unchanged (Open-Meteo matches DB: ${weather.condition} ${weather.temp_c}°C)`
        )
      }
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
      `${dryRun ? '  ◇ [dry-run]' : '  ✓'} activity ${act.id}: weather → ${weather.condition}, ${weather.temp_c}°C (was ${act.weather_temp_c ?? '—'}°C) [${wx.source}]`
    )
    weatherUpdated++
    activityIdsTouched.push(act.id)
    if (dryRun) dryRunWeatherByActivityId.set(act.id, weather)
    await sleep(openMeteoSleepMs)

    const n = idx + 1
    if (progressEvery > 0 && totalActs > 0 && n % progressEvery === 0) {
      const elapsed = Date.now() - weatherPassStarted
      const rate = elapsed > 0 ? n / (elapsed / 1000) : 0
      const remaining = totalActs - n
      const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0
      console.log(
        `[${isoNow()}] progress weather ${n}/${totalActs} (${Math.round((100 * n) / totalActs)}%) ` +
          `phase_elapsed=${fmtDuration(elapsed)} eta≈${fmtDuration(etaMs)} | ` +
          `updated=${weatherUpdated} skipped=${weatherSkipped} failed=${weatherFailed} no_coords=${noCoords}`
      )
    }
  }

  console.log(
    `[${isoNow()}] Weather pass done in ${fmtDuration(Date.now() - weatherPassStarted)} | ` +
      `updated=${weatherUpdated} unchanged=${weatherSkipped} failed=${weatherFailed} no_coords=${noCoords}` +
      ` | coords: start=${weatherUsedStart} polyline=${weatherUsedPolyline} home=${weatherUsedHome} start_backfilled=${startCoordsBackfilled}\n`
  )

  let photosUpdated = 0,
    photosSkipped = 0,
    photosWarn = 0

  if (refreshPhotos) {
    if (dryRun) {
      const estMin = Math.round((activities.length * stravaSleepMs) / 60000)
      console.log(
        `[${isoNow()}] Photo pass [DRY RUN]: would call Strava /photos × ${activities.length} ` +
          `(~${estMin} min sleep-only at ${stravaSleepMs}ms/req; real time higher)\n`
      )
    } else {
      let accessToken: string
      try {
        accessToken = await getValidAccessToken()
      } catch (e) {
        console.error('Cannot --refresh-photos without Strava tokens. Connect Strava in the app first.', e)
        process.exit(1)
      }
      const photoPassStarted = Date.now()
      const estMin = Math.round((activities.length * stravaSleepMs) / 60000)
      console.log(
        `[${isoNow()}] Photo pass start | activities=${activities.length} ` +
          `stravaSleepMs=${stravaSleepMs} (~${estMin} min minimum from pacing alone)`
      )

      for (let pidx = 0; pidx < activities.length; pidx++) {
        const act = activities[pidx]
        try {
          if (verbose) {
            console.log(
              `  [photos] ${pidx + 1}/${activities.length} id=${act.id} had_stored=${(act.photo_urls?.length ?? 0) > 0} count=${act.photo_urls?.length ?? 0}`
            )
          }
          const urls = await fetchActivityPhotos(accessToken, act.id)
          const hadStored = (act.photo_urls?.length ?? 0) > 0

          if (urls.length === 0) {
            if (hadStored) {
              console.warn(
                `  ⚠ activity ${act.id}: Strava returned no photo URLs (rate limit or API error?); keeping stored URLs`
              )
              photosWarn++
            } else {
              if (verbose) console.log(`  [photos] id=${act.id} empty response, no prior photos`)
              photosSkipped++
            }
            await sleep(stravaSleepMs)
            continue
          }

          if (photoUrlsEqual(act.photo_urls, urls)) {
            if (verbose) console.log(`  [photos] id=${act.id} unchanged (${urls.length} URLs)`)
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

        const n = pidx + 1
        if (progressEvery > 0 && activities.length > 0 && n % progressEvery === 0) {
          const elapsed = Date.now() - photoPassStarted
          const rate = elapsed > 0 ? n / (elapsed / 1000) : 0
          const remaining = activities.length - n
          const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0
          console.log(
            `[${isoNow()}] progress photos ${n}/${activities.length} (${Math.round((100 * n) / activities.length)}%) ` +
              `phase_elapsed=${fmtDuration(elapsed)} eta≈${fmtDuration(etaMs)} | ` +
              `updated=${photosUpdated} skipped=${photosSkipped} issues=${photosWarn}`
          )
        }
      }

      console.log(
        `[${isoNow()}] Photo pass done in ${fmtDuration(Date.now() - photoPassStarted)} | ` +
          `updated=${photosUpdated} unchanged_or_empty=${photosSkipped} issues=${photosWarn}\n`
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

  console.log(
    `[${isoNow()}] Loading journal rows (${regenerate ? 'full window' : 'weather-touched activities only'})…`
  )
  const journalRows = regenerate
    ? await fetchJournalRowsSince(cutoffIso, { verbose })
    : await fetchJournalsForActivities(activityIdsTouched)

  console.log(
    `[${isoNow()}] ${regenerate ? 'Journal rows in window (regenerate all)' : 'Journal rows for touched activities'}: ${journalRows.length}\n`
  )

  let headersUpdated = 0,
    headersSkipped = 0,
    regenUpdated = 0,
    journalErrors = 0

  const journalPassStarted = Date.now()
  const totalJournals = journalRows.length

  for (let jidx = 0; jidx < journalRows.length; jidx++) {
    const row = journalRows[jidx]
    try {
      const activity = row.activity
      if (!activity) {
        console.warn(`⚠ journal ${row.id}: missing activity join`)
        journalErrors++
        continue
      }

      if (verbose) {
        const wx = resolveWeatherCoords(
          {
            start_lat: activity.start_lat,
            start_lng: activity.start_lng,
            map_polyline: activity.map_polyline,
          },
          home
        )
        console.log(
          `  [journal] ${jidx + 1}/${totalJournals} entry=${row.id} activity=${row.activity_id} ` +
            `start=${activity.start_date} photos=${activity.photo_urls?.length ?? 0} ` +
            `weather_coord_src=${wx?.source ?? 'none'} old_title=${JSON.stringify(row.title)}`
        )
      }

      const activityForAi =
        dryRun && dryRunWeatherByActivityId.has(row.activity_id)
          ? activityWithRefetchedWeather(activity, dryRunWeatherByActivityId.get(row.activity_id)!)
          : activity

      if (regenerate) {
        const t0 = Date.now()
        const photoUrls =
          activity.photo_urls && activity.photo_urls.length > 0 ? activity.photo_urls : undefined
        const generated = await generateJournalEntry(
          activityForAi,
          row.human_note || undefined,
          photoUrls
        )
        const genMs = Date.now() - t0

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
          `${dryRun ? '  ◇ [dry-run]' : '  ✓'} journal ${row.id}: ${dryRun ? 'would regenerate' : 'regenerated'} "${generated.title}" ` +
            `[${genMs}ms claude] mood ${generated.mood}`
        )
        regenUpdated++
        await sleep(claudeSleepMs)

        const n = jidx + 1
        if (progressEvery > 0 && totalJournals > 0 && n % progressEvery === 0) {
          const elapsed = Date.now() - journalPassStarted
          const rate = elapsed > 0 ? n / (elapsed / 1000) : 0
          const remaining = totalJournals - n
          const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0
          console.log(
            `[${isoNow()}] progress journals ${n}/${totalJournals} (${Math.round((100 * n) / totalJournals)}%) ` +
              `phase_elapsed=${fmtDuration(elapsed)} eta≈${fmtDuration(etaMs)} | ` +
              `regenerated=${regenUpdated} errors=${journalErrors}`
          )
        }
        continue
      }

      const header = buildEntryStatsHeader(activityForAi)
      if (!header) {
        if (verbose) console.log(`  [journal] ${row.id}: skip header (empty stats block)`)
        headersSkipped++
        continue
      }

      const bodyRaw = stripLeadingStatsHeader(row.entry)
      const body = replaceCelsiusWithFahrenheitInText(bodyRaw)
      const newEntry = `${header}\n\n${body}`.trimEnd()

      if (newEntry === row.entry.trimEnd()) {
        if (verbose) console.log(`  [journal] ${row.id}: header already matches DB`)
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
      console.error(`[${isoNow()}] ✗ journal ${row.id} activity_id=${row.activity_id}:`, e)
      journalErrors++
    }

    const n = jidx + 1
    if (!regenerate && progressEvery > 0 && totalJournals > 0 && n % progressEvery === 0) {
      const elapsed = Date.now() - journalPassStarted
      const rate = elapsed > 0 ? n / (elapsed / 1000) : 0
      const remaining = totalJournals - n
      const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0
      console.log(
        `[${isoNow()}] progress headers ${n}/${totalJournals} phase_elapsed=${fmtDuration(elapsed)} eta≈${fmtDuration(etaMs)} | ` +
          `updated=${headersUpdated} skipped=${headersSkipped} errors=${journalErrors}`
      )
    }
  }

  if (totalJournals > 0) {
    console.log(`[${isoNow()}] Journal phase done in ${fmtDuration(Date.now() - journalPassStarted)}`)
  }

  const headerUpdatedLabel = dryRun ? 'journal_headers_would_update' : 'journal_headers_updated'
  const photoSummary = refreshPhotos ? ` photos_refreshed=${photosUpdated}` : ''
  const wall = fmtDuration(Date.now() - runStarted)
  console.log(
    `\n[${isoNow()}] Done (wall ${wall}). weather_rows_${dryRun ? 'would_update' : 'updated'}=${weatherUpdated}${photoSummary} ` +
      (regenerate
        ? `claude_regenerated=${regenUpdated} journal_errors=${journalErrors}`
        : `${headerUpdatedLabel}=${headersUpdated} journal_headers_unchanged=${headersSkipped} journal_errors=${journalErrors}`)
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
