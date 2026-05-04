-- Chilli Journal Schema
-- Run this in your Supabase SQL editor

-- Activities table: stores raw Strava activity data
create table if not exists activities (
  id bigint primary key, -- Strava activity ID
  strava_id bigint unique not null,
  name text not null,
  start_date timestamptz not null,
  distance_meters float,
  moving_time_seconds int,
  elapsed_time_seconds int,
  total_elevation_gain float,
  sport_type text,
  start_lat float,
  start_lng float,
  city text,
  country text,
  weather_temp_c float,
  weather_condition text,
  weather_wind_kmh float,
  weather_precipitation_mm float,
  photo_urls text[], -- array of photo URLs from Strava
  map_polyline text, -- encoded polyline for route
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Journal entries table: AI-generated narratives
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  activity_id bigint references activities(id) on delete cascade,
  title text not null,
  entry text not null,
  tags text[],
  mood text check (mood in ('EPIC', 'EXCELLENT', 'SOLID', 'SUSPICIOUS', 'CHAOTIC')),
  human_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Strava auth tokens (single row for the app owner)
create table if not exists strava_tokens (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  athlete_id bigint,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

-- Webhook / ingestion audit log (append-only; query in Supabase when Vercel logs expire)
create table if not exists webhook_ingest_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  strava_activity_id bigint,
  strava_owner_id bigint,
  stage text not null,
  detail text,
  meta jsonb,
  error_message text
);

create index if not exists webhook_ingest_logs_created_at_idx on webhook_ingest_logs(created_at desc);
create index if not exists webhook_ingest_logs_activity_idx on webhook_ingest_logs(strava_activity_id);

alter table webhook_ingest_logs enable row level security;
-- Inserts use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). No anon/authenticated policies.

-- Indexes
create index if not exists activities_start_date_idx on activities(start_date desc);
create index if not exists journal_entries_activity_id_idx on journal_entries(activity_id);

-- Helpful view joining entries with activity stats
create or replace view entries_with_stats as
  select
    je.id,
    je.title,
    je.entry,
    je.tags,
    je.mood,
    je.human_note,
    je.created_at,
    a.strava_id,
    a.start_date,
    a.distance_meters,
    a.moving_time_seconds,
    a.total_elevation_gain,
    a.sport_type,
    a.city,
    a.weather_temp_c,
    a.weather_condition,
    a.photo_urls,
    a.start_lat,
    a.start_lng
  from journal_entries je
  join activities a on je.activity_id = a.id
  order by a.start_date desc;
