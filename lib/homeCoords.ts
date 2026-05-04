/**
 * Home base for “furthest from home” and journal sorting.
 * Set `HOME_LAT` and `HOME_LNG` (decimal degrees) in `.env.local` / Vercel.
 */
export function getHomeCoordsFromEnv(): { lat: number; lng: number } | null {
  const lat = Number(process.env.HOME_LAT)
  const lng = Number(process.env.HOME_LNG)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
