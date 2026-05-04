/**
 * Fix activities.start_lat / start_lng where stored pairs disagree with
 * normalizeStartLatLng (e.g. lat/lng swapped). Requires HOME_LAT and HOME_LNG in .env.local.
 *
 *   npm run repair:coords
 *   npm run repair:coords -- --dry-run
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { normalizeStartLatLng } from '../lib/geo'
import { getHomeCoordsFromEnv } from '../lib/homeCoords'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function nearlyEq(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return Math.abs(a - b) < 1e-6
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const home = getHomeCoordsFromEnv()
  if (!home) {
    console.error('Set HOME_LAT and HOME_LNG in .env.local so swapped coords can be detected.')
    process.exit(1)
  }

  const pageSize = 1000
  let updated = 0
  let scanned = 0

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('activities')
      .select('id, start_lat, start_lng')
      .range(from, to)
    if (error) throw error
    const rows = data || []
    scanned += rows.length

    for (const row of rows) {
      const { lat, lng } = normalizeStartLatLng(row.start_lat, row.start_lng, home)
      if (lat === null && lng === null) continue
      if (nearlyEq(lat, row.start_lat as number | null) && nearlyEq(lng, row.start_lng as number | null)) {
        continue
      }

      console.log(
        dryRun ? '[dry-run] would update' : 'updating',
        `id=${row.id} (${row.start_lat}, ${row.start_lng}) -> (${lat}, ${lng})`
      )
      if (!dryRun) {
        const { error: uErr } = await supabaseAdmin
          .from('activities')
          .update({ start_lat: lat, start_lng: lng })
          .eq('id', row.id)
        if (uErr) throw uErr
      }
      updated++
    }

    if (rows.length < pageSize) break
  }

  console.log(`\nDone. scanned=${scanned} ${dryRun ? 'would_update' : 'updated'}=${updated}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
