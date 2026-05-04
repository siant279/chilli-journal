import type { EntryWithStats } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * “Furthest from home” uses **only** your configured home (no hardcoded default).
 * Set in `.env.local` and Vercel: `HOME_LAT` and `HOME_LNG` (decimal degrees, e.g. 39.3260 -120.1850).
 * If either is missing/invalid, the furthest-from-home spotlight is omitted.
 */
function homeCoordsFromEnv(): { lat: number; lng: number } | null {
  const lat = Number(process.env.HOME_LAT)
  const lng = Number(process.env.HOME_LNG)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/** Haversine distance in meters. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lng2 - lng1)
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function tieDateMs(e: EntryWithStats): number {
  return new Date(e.start_date).getTime()
}

function pickMax<T>(rows: T[], score: (row: T) => number, allow: (row: T) => boolean): T | null {
  const eligible = rows.filter(allow)
  if (!eligible.length) return null
  return eligible.reduce((best, cur) => {
    const sb = score(best)
    const sc = score(cur)
    if (sc > sb) return cur
    if (sc < sb) return best
    return tieDateMs(cur as EntryWithStats) >= tieDateMs(best as EntryWithStats) ? cur : best
  })
}

function formatMi(meters: number): string {
  return `${(meters / 1609.34).toFixed(1)} mi`
}

function formatDur(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatElev(meters: number): string {
  return `${Math.round(meters * 3.28084).toLocaleString()} ft`
}

export type WalkHighlight = {
  kind: 'longest_outing' | 'most_elevation' | 'furthest_from_home'
  badge: string
  title: string
  stat: string
  sub: string
  entry: EntryWithStats
}

async function fetchAllEntriesWithStats(admin: SupabaseClient): Promise<EntryWithStats[]> {
  const pageSize = 1000
  const all: EntryWithStats[] = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await admin
      .from('entries_with_stats')
      .select('*')
      .order('start_date', { ascending: false })
      .range(from, to)
    if (error) throw error
    const batch = (data || []) as EntryWithStats[]
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

/**
 * Current record-holding walks (all journaled activities). Updates whenever a new walk tops a metric.
 */
export async function getWalkHighlights(admin: SupabaseClient): Promise<WalkHighlight[]> {
  const rows = await fetchAllEntriesWithStats(admin)
  if (rows.length === 0) return []

  const home = homeCoordsFromEnv()
  const out: WalkHighlight[] = []

  const longest = pickMax(
    rows,
    r => r.moving_time_seconds,
    r => r.moving_time_seconds > 0
  )
  if (longest) {
    out.push({
      kind: 'longest_outing',
      badge: 'Longest outing',
      title: longest.title,
      stat: formatDur(longest.moving_time_seconds),
      sub: `${formatMi(longest.distance_meters)} · ${new Date(longest.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      entry: longest,
    })
  }

  const climb = pickMax(
    rows,
    r => r.total_elevation_gain,
    r => r.total_elevation_gain > 0
  )
  if (climb) {
    out.push({
      kind: 'most_elevation',
      badge: 'Most elevation',
      title: climb.title,
      stat: formatElev(climb.total_elevation_gain),
      sub: `${formatMi(climb.distance_meters)} · ${new Date(climb.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      entry: climb,
    })
  }

  if (home) {
    const far = pickMax(
      rows,
      r => {
        if (r.start_lat == null || r.start_lng == null) return -1
        return haversineMeters(home.lat, home.lng, r.start_lat, r.start_lng)
      },
      r => r.start_lat != null && r.start_lng != null
    )
    if (far) {
      const m = haversineMeters(home.lat, home.lng, far.start_lat!, far.start_lng!)
      const mi = m / 1609.34
      out.push({
        kind: 'furthest_from_home',
        badge: 'Furthest from home',
        title: far.title,
        stat: `${mi.toFixed(1)} mi away`,
        sub: `${far.city || 'Sierra trail'} · ${new Date(far.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        entry: far,
      })
    }
  }

  return out
}
