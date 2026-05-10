// Open-Meteo: free historical weather API, no key needed
// Docs: https://open-meteo.com/en/docs/historical-weather-api

/** Strava / journal activities are narrated in Pacific time (Truckee). */
export const ACTIVITY_TIMEZONE = 'America/Los_Angeles'

type WeatherData = {
  temp_c: number
  condition: string
  wind_kmh: number
  precipitation_mm: number
}

const WMO_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'icy fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',   99: 'thunderstorm with heavy hail',
}

/** Calendar YYYY-MM-DD in a specific IANA timezone (walk-local date for API bounds). */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function wallClockHourMinuteInTimeZone(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10)
  return { hour, minute }
}

/** Coarse label for narrative tone (matches walk start in Pacific). */
export function timeOfDayLabelForPrompt(date: Date, timeZone = ACTIVITY_TIMEZONE): string {
  const { hour, minute } = wallClockHourMinuteInTimeZone(date, timeZone)
  const h = hour + minute / 60
  if (h < 5) return 'night'
  if (h < 8) return 'early morning'
  if (h < 12) return 'morning'
  if (h < 14) return 'midday'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

/** Index into Open-Meteo hourly arrays for this instant (wall-clock in `timeZone`, rounded to nearest hour). */
export function hourlyIndexForInstant(
  date: Date,
  timeZone: string,
  hourlyLength: number
): number {
  if (hourlyLength <= 0) return 0
  const { hour, minute } = wallClockHourMinuteInTimeZone(date, timeZone)
  const slot = Math.round(hour + minute / 60)
  return Math.min(Math.max(0, slot), hourlyLength - 1)
}

export async function getHistoricalWeather(
  lat: number,
  lng: number,
  date: Date
): Promise<WeatherData | null> {
  try {
    const dateStr = ymdInTimeZone(date, ACTIVITY_TIMEZONE)

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      start_date: dateStr,
      end_date: dateStr,
      hourly: 'temperature_2m,weathercode,windspeed_10m,precipitation',
      timezone: ACTIVITY_TIMEZONE,
      windspeed_unit: 'kmh',
    })

    const resp = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
    if (!resp.ok) return null

    const data = await resp.json()
    const hourly = data.hourly

    if (!hourly?.temperature_2m?.length) return null

    const idx = hourlyIndexForInstant(date, ACTIVITY_TIMEZONE, hourly.temperature_2m.length)

    return {
      temp_c: Math.round(hourly.temperature_2m[idx]),
      condition: WMO_CODES[hourly.weathercode[idx]] || 'unknown',
      wind_kmh: Math.round(hourly.windspeed_10m[idx]),
      precipitation_mm: hourly.precipitation[idx] || 0,
    }
  } catch {
    return null
  }
}

/** Whole °F for display; stored values remain Celsius (`weather_temp_c`). */
export function tempCToF(temp_c: number): number {
  return Math.round(temp_c * (9 / 5) + 32)
}

/**
 * Replace Celsius temperatures in journal prose with °F (e.g. `12°C`, `12 °C`, Unicode ℃).
 * Does not alter numbers that are not followed by a degree-C marker.
 */
export function replaceCelsiusWithFahrenheitInText(text: string): string {
  return text.replace(/(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃)/gi, (full, numStr: string) => {
    const c = parseFloat(numStr)
    if (!Number.isFinite(c)) return full
    return `${tempCToF(c)}°F`
  })
}

export function weatherSummaryForPrompt(weather: WeatherData | null): string {
  if (!weather) return ''
  const tempF = tempCToF(weather.temp_c)
  return `Weather (Open-Meteo hourly snapshot at walk start, local Pacific): ${weather.condition}, ${tempF}°F, wind ${weather.wind_kmh}km/h${weather.precipitation_mm > 0 ? `, ${weather.precipitation_mm}mm precipitation` : ''}.`
}
