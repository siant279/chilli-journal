import { createClient } from '@supabase/supabase-js'
import type { EntryWithStats } from './supabase'

export const PREVIEW_STATS = {
  totalAdventures: 679,
  totalMiles: '1652',
  totalHours: 412,
  topSeason: 'Summer',
}

/** Fallback when Supabase is unavailable (e.g. local without env). */
export const SAMPLE_ENTRY_FIXTURE: EntryWithStats = {
  id: 'preview-sample',
  activity_id: 18747237419,
  strava_id: 18747237419,
  title: 'Midday Miles, Minimal Complaints',
  entry:
    'The trail smelled like pine and last week\'s rain. I approved of both.\n\nSian kept a steady pace — acceptable. Squirrel density was moderate. One suspicious rustle near a stump; investigated thoroughly. Verdict: false alarm. Would still rate the stump as SUSPICIOUS on principle.\n\nLake access: denied today. I filed a formal complaint by sitting in the shade and refusing to move for ninety seconds.',
  tags: ['trail', 'sierra', 'squirrel_watch', 'shade_break'],
  mood: 'SOLID',
  human_note: null,
  created_at: '2026-06-01T20:00:00Z',
  updated_at: '2026-06-01T20:00:00Z',
  start_date: '2026-06-01T19:40:54+00:00',
  distance_meters: 4820,
  moving_time_seconds: 3420,
  total_elevation_gain: 85,
  sport_type: 'Walk',
  city: 'Truckee',
  region: 'California',
  country: 'United States',
  weather_temp_c: 18,
  weather_condition: 'Partly cloudy',
  photo_urls: null,
  start_lat: 39.328,
  start_lng: -120.183,
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  )
}

export async function getPreviewSampleEntry(): Promise<EntryWithStats> {
  if (!hasSupabaseEnv()) {
    return SAMPLE_ENTRY_FIXTURE
  }

  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await admin
      .from('entries_with_stats')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) return data
  } catch {
    // use fixture
  }
  return SAMPLE_ENTRY_FIXTURE
}

export function isUsingPreviewFixture(entry: EntryWithStats): boolean {
  return entry.id === SAMPLE_ENTRY_FIXTURE.id
}
