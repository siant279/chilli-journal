/**
 * Calendar helpers for America/Los_Angeles (Truckee / Sierra Nevada journal context).
 */

/** Today's date YYYY-MM-DD in Los Angeles. */
export function laTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * UTC ISO range [start, end) for calendar day `ymd` (YYYY-MM-DD) in America/Los_Angeles.
 */
export function laDayBoundsUtc(ymd: string): { start: string; end: string } {
  const [y, mo, d] = ymd.split('-').map(Number)
  if (!y || !mo || !d) throw new Error(`Invalid date "${ymd}", expected YYYY-MM-DD`)

  const target = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0)
  let hi = Date.UTC(y, mo - 1, d + 1, 0, 0, 0)
  let startMs = lo
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const la = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(mid))
    if (la < target) lo = mid + 1
    else hi = mid
  }
  startMs = lo
  const start = new Date(startMs)
  const end = new Date(startMs + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}
