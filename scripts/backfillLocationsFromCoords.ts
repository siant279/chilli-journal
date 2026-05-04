/**
 * Fill activities.city / region / country from OpenStreetMap Nominatim when start coordinates exist
 * and any of those fields are missing. Respects ~1 req/s to Nominatim.
 *
 *   npm run backfill:locations
 *   npm run backfill:locations -- --dry-run --limit 5
 *
 * Afterward, refresh journal stat headers: npm run backfill:entries
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { resolveActivityPlaceNames } from '../lib/reverseGeocode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out = { dryRun: false, limit: Infinity as number }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error('--limit must be a positive number')
      out.limit = n
    }
  }
  return out
}

async function main() {
  const { dryRun, limit } = parseArgs()
  const pageSize = 500
  let updated = 0

  outer: for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('activities')
      .select('id, start_lat, start_lng, city, country, region')
      .range(from, to)
    if (error) throw error
    const rows = data || []
    if (!rows.length) break

    for (const row of rows) {
      if (updated >= limit) break outer
      if (row.city && row.country && row.region) continue
      if (row.start_lat == null || row.start_lng == null) continue

      const place = await resolveActivityPlaceNames(
        row.start_lat,
        row.start_lng,
        row.city,
        row.country,
        row.region
      )
      if (!place.geocoded) continue

      const same =
        place.city === row.city &&
        place.region === row.region &&
        place.country === row.country
      if (same) {
        await sleep(1100)
        continue
      }

      console.log(
        dryRun ? '[dry-run] would update' : 'updating',
        `id=${row.id}`,
        { city: place.city, region: place.region, country: place.country }
      )

      if (!dryRun) {
        const { error: uErr } = await supabaseAdmin
          .from('activities')
          .update({
            city: place.city,
            region: place.region,
            country: place.country,
          })
          .eq('id', row.id)
        if (uErr) throw uErr
      }
      updated += 1
      await sleep(1100)
    }

    if (updated >= limit || rows.length < pageSize) break outer
  }

  console.log(`\nDone. ${dryRun ? 'dry-run' : `updated=${updated}`}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
