import { supabaseAdmin } from '@/lib/supabase'
import { EntryWithStats } from '@/lib/supabase'
import JournalClient from '@/components/JournalClient'
import { getValidAccessToken } from '@/lib/strava'
import { getWalkHighlights } from '@/lib/highlightedWalks'

/** New journal rows must show without redeploy; do not statically cache this page at build time. */
export const dynamic = 'force-dynamic'

async function getEntries(): Promise<EntryWithStats[]> {
  const { data, error } = await supabaseAdmin
    .from('entries_with_stats')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Failed to fetch entries:', error)
    return []
  }
  return data || []
}

/** Full list of walk dates for the rolling 12‑month chart (not capped at 100 rows). */
async function getEntryStartDatesForChart(): Promise<string[]> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 14)
  cutoff.setDate(1)
  cutoff.setHours(0, 0, 0, 0)

  const { data, error } = await supabaseAdmin
    .from('entries_with_stats')
    .select('start_date')
    .gte('start_date', cutoff.toISOString())

  if (error) {
    console.error('Failed to fetch chart dates:', error)
    return []
  }
  return (data ?? []).map(r => r.start_date)
}

async function getStats() {
  const { data: activities } = await supabaseAdmin
    .from('activities')
    .select('distance_meters, total_elevation_gain, moving_time_seconds, start_date, sport_type, weather_condition')

  if (!activities?.length) return null

  const totalMiles = activities.reduce((s, a) => s + (a.distance_meters / 1609.34), 0)
  const totalElevFt = activities.reduce((s, a) => s + (a.total_elevation_gain * 3.28084), 0)
  const totalMinutes = activities.reduce((s, a) => s + (a.moving_time_seconds / 60), 0)
  const avgMiles = totalMiles / activities.length

  // Season breakdown
  const seasons = activities.reduce((acc: Record<string, number>, a) => {
    const month = new Date(a.start_date).getMonth() + 1
    const season = month >= 12 || month <= 2 ? 'Winter' :
                   month >= 3 && month <= 5 ? 'Spring' :
                   month >= 6 && month <= 8 ? 'Summer' : 'Fall'
    acc[season] = (acc[season] || 0) + 1
    return acc
  }, {})

  const topSeason = Object.entries(seasons).sort((a, b) => b[1] - a[1])[0]?.[0]

  // Activity types
  const types = activities.reduce((acc: Record<string, number>, a) => {
    const type = a.sport_type || 'Walk'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})

  return {
    totalAdventures: activities.length,
    totalMiles: totalMiles.toFixed(1),
    totalElevFt: Math.round(totalElevFt).toLocaleString(),
    totalHours: Math.round(totalMinutes / 60),
    avgMiles: avgMiles.toFixed(1),
    topSeason,
    activityTypes: types,
    seasons,
  }
}

async function checkStravaConnected(): Promise<boolean> {
  // Don't treat "row exists" as connected — tokens can be revoked/invalid while the row remains.
  try {
    await getValidAccessToken()
    return true
  } catch {
    return false
  }
}

export default async function Home() {
  const [entries, stats, stravaConnected, chartStartDates, recordWalks] = await Promise.all([
    getEntries(),
    getStats(),
    checkStravaConnected(),
    getEntryStartDatesForChart(),
    getWalkHighlights(supabaseAdmin),
  ])

  return (
    <JournalClient
      initialEntries={entries}
      stats={stats}
      stravaConnected={stravaConnected}
      chartStartDates={chartStartDates}
      recordWalks={recordWalks}
    />
  )
}
