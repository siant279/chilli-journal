/**
 * Backfill journal entry text with the auto stats header (start time, distance, moving time, etc.)
 * or fully regenerate entries via Claude.
 *
 *   npm run backfill:entries
 *   npm run backfill:entries -- --regenerate
 *
 * Header-only run rebuilds the top stats block (Start, Location, Weather, distance, etc.) from
 * `activities`, converts any `°C` temperature mentions in the narrative body to °F, and writes
 * the combined text back — use after changing buildEntryStatsHeader, units, or activity weather data.
 *   npm run backfill:entries -- --limit 20 --dry-run
 *
 * Single entry (by Supabase journal_entries.id or activities.id):
 *   npm run backfill:entries -- --regenerate --journal-id <uuid>
 *   npm run backfill:entries -- --regenerate --activity-id <number>
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import type { Activity } from '../lib/supabase'
import { buildEntryStatsHeader, generateJournalEntry } from '../lib/generateEntry'
import { stripLeadingStatsHeader } from '../lib/journalHeaderReflow'
import { replaceCelsiusWithFahrenheitInText } from '../lib/weather'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type JournalRow = {
  id: string
  activity_id: number
  title: string
  entry: string
  tags: string[] | null
  mood: string
  human_note: string | null
  activities: Activity | null
}

function normalizeJournalRow(raw: unknown): JournalRow {
  const r = raw as {
    id: string
    activity_id: number
    title: string
    entry: string
    tags: string[] | null
    mood: string
    human_note: string | null
    activities: Activity | Activity[] | null
  }

  let activity: Activity | null = null
  if (Array.isArray(r.activities)) {
    activity = (r.activities[0] as Activity | undefined) ?? null
  } else {
    activity = r.activities
  }

  return {
    id: r.id,
    activity_id: r.activity_id,
    title: r.title,
    entry: r.entry,
    tags: r.tags,
    mood: r.mood,
    human_note: r.human_note,
    activities: activity,
  }
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = {
    regenerate: false,
    dryRun: false,
    limit: Infinity as number,
    sleepMs: 500,
    journalId: undefined as string | undefined,
    activityId: undefined as number | undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--regenerate') out.regenerate = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--limit must be a positive number')
      out.limit = n
    } else if (a === '--sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--sleep-ms must be a non-negative number')
      out.sleepMs = n
    } else if (a === '--journal-id') {
      const id = argv[++i]
      if (!id?.trim()) throw new Error('--journal-id requires a UUID')
      out.journalId = id.trim()
    } else if (a === '--activity-id') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n)) throw new Error('--activity-id must be a number (activities.id / Strava activity id in DB)')
      out.activityId = n
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: npm run backfill:entries -- [options]

Options:
  --regenerate   Re-run Claude for every entry (updates title/tags/mood/entry). Costs API $ + time.
  (default)      Only prepend/fix the stats header; does not call Claude.
  --limit N      Process at most N rows (useful for testing)
  --dry-run      Log actions without writing
  --sleep-ms N   Delay between rows when --regenerate (default 500)
  --journal-id   Process only this journal_entries.id row (UUID)
  --activity-id  Process only the journal row for this activities.id (numeric PK)
`)
      process.exit(0)
    } else {
      throw new Error(`Unknown arg: ${a}`)
    }
  }
  if (out.journalId && out.activityId !== undefined) {
    throw new Error('Use only one of --journal-id or --activity-id')
  }
  return out
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function activityFromJoin(a: Activity | null): Activity | null {
  if (!a) return null
  return a
}

const journalSelect = `
        id,
        activity_id,
        title,
        entry,
        tags,
        mood,
        human_note,
        activities (*)
      `

async function fetchAllJournalRows(): Promise<JournalRow[]> {
  const pageSize = 500
  const all: JournalRow[] = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(journalSelect)
      .order('created_at', { ascending: true })
      .range(from, to)

    if (error) throw error
    const batch = (data || []).map(normalizeJournalRow)
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

async function fetchJournalRowByJournalId(journalId: string): Promise<JournalRow | null> {
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select(journalSelect)
    .eq('id', journalId)
    .maybeSingle()

  if (error) throw error
  return data ? normalizeJournalRow(data) : null
}

async function fetchJournalRowByActivityId(activityId: number): Promise<JournalRow | null> {
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select(journalSelect)
    .eq('activity_id', activityId)
    .maybeSingle()

  if (error) throw error
  return data ? normalizeJournalRow(data) : null
}

async function main() {
  const { regenerate, dryRun, limit, sleepMs, journalId, activityId } = parseArgs()
  console.log(
    `Backfill starting (${regenerate ? 'REGENERATE (Claude)' : 'header-only'})${dryRun ? ' [DRY RUN]' : ''}\n`
  )

  let rows: JournalRow[]
  if (journalId) {
    const one = await fetchJournalRowByJournalId(journalId)
    rows = one ? [one] : []
    if (!one) console.warn(`No journal_entries row for id=${journalId}\n`)
  } else if (activityId !== undefined) {
    const one = await fetchJournalRowByActivityId(activityId)
    rows = one ? [one] : []
    if (!one) console.warn(`No journal_entries row for activity_id=${activityId}\n`)
  } else {
    rows = await fetchAllJournalRows()
  }
  console.log(`Loaded ${rows.length} journal entries\n`)

  let updated = 0,
    skipped = 0,
    errors = 0,
    processed = 0

  for (const row of rows) {
    if (processed >= limit) break
    processed++

    try {
      const activity = activityFromJoin(row.activities)
      if (!activity) {
        console.warn(`⚠ ${row.id}: missing activity join for activity_id=${row.activity_id}`)
        skipped++
        continue
      }

      const header = buildEntryStatsHeader(activity)
      if (!header) {
        console.warn(`⚠ ${row.id}: no stats header could be built; skipping`)
        skipped++
        continue
      }

      if (regenerate) {
        const photoUrls = activity.photo_urls && activity.photo_urls.length > 0 ? activity.photo_urls : undefined
        const generated = await generateJournalEntry(activity, row.human_note || undefined, photoUrls)

        const same =
          generated.title === row.title &&
          generated.mood === row.mood &&
          JSON.stringify(generated.tags || []) === JSON.stringify(row.tags || []) &&
          generated.entry === row.entry

        if (same) {
          skipped++
          continue
        }

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

        console.log(`✓ ${row.id}: regenerated "${generated.title}"`)
        updated++
        await sleep(sleepMs)
        continue
      }

      const bodyRaw = stripLeadingStatsHeader(row.entry)
      const body = replaceCelsiusWithFahrenheitInText(bodyRaw)
      const newEntry = `${header}\n\n${body}`.trimEnd()

      if (newEntry === row.entry.trimEnd()) {
        skipped++
        continue
      }

      if (!dryRun) {
        const { error } = await supabaseAdmin.from('journal_entries').update({ entry: newEntry }).eq('id', row.id)
        if (error) throw error
      }

      console.log(`✓ ${row.id}: header backfill`)
      updated++
    } catch (e) {
      console.error(`✗ ${row.id}:`, e)
      errors++
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} errors=${errors} processed=${processed}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
