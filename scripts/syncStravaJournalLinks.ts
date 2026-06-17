/**
 * Backfill Strava activity descriptions with journal entry links.
 *
 *   npm run sync:strava-links
 *   npm run sync:strava-links -- --limit 20 --dry-run
 *   npm run sync:strava-links -- --limit 10          # 10 most recent entries (default order)
 *   npm run sync:strava-links -- --since 2026-01-01
 *
 * Requires activity:write — reconnect Strava in the app if you see 403 errors.
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { fetchActivity, getValidAccessToken } from '../lib/strava'
import { syncJournalLinkToStrava } from '../lib/stravaJournalLink'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = {
    dryRun: false,
    limit: Infinity as number,
    since: null as string | null,
    sleepMs: 400,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--limit must be a positive number')
      out.limit = n
    } else if (a === '--since') {
      const raw = argv[++i]
      if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new Error('--since expects YYYY-MM-DD')
      }
      out.since = raw
    } else if (a === '--sleep-ms') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) throw new Error('--sleep-ms must be a non-negative number')
      out.sleepMs = n
    }
  }
  return out
}

async function main() {
  const { dryRun, limit, since, sleepMs } = parseArgs()

  console.log('🐺 Sync journal links to Strava activity descriptions\n')

  const accessToken = await getValidAccessToken()
  console.log('✓ Strava connected\n')

  let query = supabaseAdmin
    .from('journal_entries')
    .select('id, activity_id, title, mood, created_at')
    .order('created_at', { ascending: false })

  if (since) {
    query = query.gte('created_at', `${since}T00:00:00.000Z`)
  }

  if (Number.isFinite(limit)) {
    query = query.limit(limit)
  }

  const { data: rows, error } = await query
  if (error) throw error
  if (!rows?.length) {
    console.log('No journal entries to sync.')
    return
  }

  let synced = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    if (synced + skipped + failed >= limit) break

    const activityId = Number(row.activity_id)
    console.log(`Activity ${activityId}: "${row.title}"`)

    if (dryRun) {
      synced++
      continue
    }

    try {
      const fullActivity = await fetchActivity(accessToken, activityId)
      const result = await syncJournalLinkToStrava({
        accessToken,
        activityId,
        journalEntryId: row.id,
        title: row.title,
        mood: row.mood,
        existingDescription: fullActivity.description,
      })
      if (result.ok) {
        synced++
        console.log('  ✓ updated')
      } else if (result.skipped) {
        skipped++
        console.warn(`  ⊘ skipped: ${result.error}`)
        break
      } else {
        failed++
        console.warn(`  ✗ ${result.error}`)
      }
    } catch (e) {
      failed++
      console.warn('  ✗', e instanceof Error ? e.message : e)
    }

    await sleep(sleepMs)
  }

  console.log(`\nDone. synced=${synced} skipped=${skipped} failed=${failed}${dryRun ? ' (dry-run)' : ''}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
