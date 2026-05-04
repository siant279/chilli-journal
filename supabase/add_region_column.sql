-- Run once in Supabase SQL editor if `activities` existed before `region` was added.
--
-- Postgres cannot replace a view when the SELECT column list gains a column in the middle:
-- `CREATE OR REPLACE VIEW` matches columns by position, which triggers 42P16. Drop first.

alter table activities add column if not exists region text;

drop view if exists entries_with_stats;

create view entries_with_stats as
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
    a.region,
    a.weather_temp_c,
    a.weather_condition,
    a.photo_urls,
    a.start_lat,
    a.start_lng,
    a.country
  from journal_entries je
  join activities a on je.activity_id = a.id
  order by a.start_date desc;
