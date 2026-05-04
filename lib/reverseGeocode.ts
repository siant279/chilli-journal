/**
 * Reverse geocode start coordinates to town / state / country (OpenStreetMap Nominatim).
 * https://operations.osmfoundation.org/policies/nominatim/ — cache results in DB; max ~1 req/s.
 */

export type GeocodedPlace = {
  city: string | null
  region: string | null
  country: string | null
}

type NominatimAddr = {
  city?: string
  town?: string
  village?: string
  hamlet?: string
  municipality?: string
  county?: string
  state?: string
  region?: string
  country?: string
  country_code?: string
  'ISO3166-2-lvl4'?: string
}

function pickTown(addr: NominatimAddr): string | null {
  const t =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.municipality ||
    null
  if (t) return t
  if (addr.county) return addr.county
  return null
}

/** State / province: prefer ISO3166-2 suffix (e.g. US-CA → CA), else full state name. */
function pickRegion(addr: NominatimAddr): string | null {
  const iso = addr['ISO3166-2-lvl4']
  if (iso && iso.includes('-')) {
    const rest = iso.split('-').pop()
    if (rest && rest.length >= 2 && rest.length <= 4) return rest
  }
  if (addr.state) return addr.state
  if (addr.region && addr.country_code !== 'us') return addr.region
  return null
}

const UA =
  process.env.NOMINATIM_USER_AGENT ||
  'ChilliJournal/1.0 (https://github.com/siant279/chilli-journal; contact via repo)'

export async function reverseGeocodePlace(lat: number, lng: number): Promise<GeocodedPlace | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')

  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 15_000)
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en',
      },
      signal: ac.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { address?: NominatimAddr }
    const addr = body.address
    if (!addr) return null

    const city = pickTown(addr)
    const region = pickRegion(addr)
    const country = addr.country ?? null

    if (!city && !region && !country) return null
    return { city, region, country }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export type ResolvedPlace = {
  city: string | null
  region: string | null
  country: string | null
  /** True when Nominatim was called (bulk imports should delay ~1s after this). */
  geocoded: boolean
}

/**
 * Merge Strava fields with a one-off reverse geocode when coordinates exist and any display field is missing.
 */
export async function resolveActivityPlaceNames(
  lat: number | null,
  lng: number | null,
  stravaCity: string | null | undefined,
  stravaCountry: string | null | undefined,
  existingRegion: string | null | undefined
): Promise<ResolvedPlace> {
  let city = stravaCity || null
  let country = stravaCountry || null
  let region = existingRegion || null

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { city, region, country, geocoded: false }
  }

  const needGeocode = !city || !country || !region
  if (!needGeocode) {
    return { city, region, country, geocoded: false }
  }

  const g = await reverseGeocodePlace(lat, lng)
  if (!g) {
    return { city, region, country, geocoded: true }
  }

  return {
    city: city || g.city,
    region: region || g.region,
    country: country || g.country,
    geocoded: true,
  }
}
