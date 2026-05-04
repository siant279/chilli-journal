/** Haversine great-circle distance in meters (WGS84). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lng2 - lng1)
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function finiteCoord(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Strava supplies start_latlng as [latitude, longitude]. Occasionally stored values are swapped or
 * malformed; when `home` is known, prefer whichever ordering places the start near home if the
 * other ordering is implausibly far (fixes “700+ mi from home” for a local walk).
 */
export function normalizeStartLatLng(
  rawLat: number | null | undefined,
  rawLng: number | null | undefined,
  home?: { lat: number; lng: number } | null
): { lat: number | null; lng: number | null } {
  const lat = finiteCoord(rawLat)
  const lng = finiteCoord(rawLng)
  if (lat === null || lng === null) return { lat: null, lng: null }

  let a = lat
  let b = lng

  if (Math.abs(a) > 90) {
    if (Math.abs(b) <= 90) return { lat: b, lng: a }
    return { lat: null, lng: null }
  }
  if (Math.abs(b) > 180) return { lat: null, lng: null }

  if (home) {
    const dDirect = haversineMeters(home.lat, home.lng, a, b)
    const dSwapped = haversineMeters(home.lat, home.lng, b, a)
    const nearHomeM = 100_000
    const implausibleM = 250_000
    if (dSwapped < nearHomeM && dDirect > implausibleM && dSwapped < dDirect) {
      return { lat: b, lng: a }
    }
  }

  return { lat: a, lng: b }
}

/** Great-circle distance from home to the activity start, after {@link normalizeStartLatLng}. */
export function haversineFromHome(
  home: { lat: number; lng: number },
  rawLat: number | null | undefined,
  rawLng: number | null | undefined
): number | null {
  const { lat, lng } = normalizeStartLatLng(rawLat, rawLng, home)
  if (lat === null || lng === null) return null
  return haversineMeters(home.lat, home.lng, lat, lng)
}

/** Readable start coordinates when Strava did not supply city/country. ~11 m precision at 4 decimals. */
export function formatLatLngForDisplay(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`
}

/**
 * Label for journal header / UI: city + country from Strava when present; otherwise formatted GPS start.
 */
export function activityStartLocationLabel(activity: {
  city: string | null | undefined
  country: string | null | undefined
  start_lat: number | null | undefined
  start_lng: number | null | undefined
}): string | null {
  const parts = [activity.city, activity.country].filter(Boolean) as string[]
  if (parts.length) return parts.join(', ')
  const lat = finiteCoord(activity.start_lat)
  const lng = finiteCoord(activity.start_lng)
  if (lat === null || lng === null) return null
  return formatLatLngForDisplay(lat, lng)
}
