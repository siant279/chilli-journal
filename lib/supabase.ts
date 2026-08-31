import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
// Runtime schema comes from env; types stay on public because table names do not change.
const supabaseSchema = (process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || 'public') as 'public'
const db = { schema: supabaseSchema }

// Client for browser/API routes (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { db })

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { db })

export type Activity = {
  id: number
  strava_id: number
  name: string
  start_date: string
  distance_meters: number
  moving_time_seconds: number
  elapsed_time_seconds: number
  total_elevation_gain: number
  sport_type: string
  start_lat: number | null
  start_lng: number | null
  city: string | null
  region: string | null
  country: string | null
  weather_temp_c: number | null
  weather_condition: string | null
  weather_wind_kmh: number | null
  weather_precipitation_mm: number | null
  photo_urls: string[] | null
  map_polyline: string | null
  created_at: string
  updated_at: string
}

export type JournalEntry = {
  id: string
  activity_id: number
  title: string
  entry: string
  tags: string[]
  mood: 'EPIC' | 'EXCELLENT' | 'SOLID' | 'SUSPICIOUS' | 'CHAOTIC'
  human_note: string | null
  created_at: string
  updated_at: string
}

export type EntryWithStats = JournalEntry & {
  strava_id: number
  start_date: string
  distance_meters: number
  moving_time_seconds: number
  total_elevation_gain: number
  sport_type: string
  city: string | null
  region: string | null
  country: string | null
  weather_temp_c: number | null
  weather_condition: string | null
  photo_urls: string[] | null
  start_lat: number | null
  start_lng: number | null
}
