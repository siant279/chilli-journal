// Open-Meteo: free historical weather API, no key needed
// Docs: https://open-meteo.com/en/docs/historical-weather-api

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
  96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
}

export async function getHistoricalWeather(
  lat: number,
  lng: number,
  date: Date
): Promise<WeatherData | null> {
  try {
    const dateStr = date.toISOString().split('T')[0]
    // Get the hour of the activity for more accurate conditions
    const hour = date.getHours()

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      start_date: dateStr,
      end_date: dateStr,
      hourly: 'temperature_2m,weathercode,windspeed_10m,precipitation',
      timezone: 'America/Los_Angeles',
      windspeed_unit: 'kmh',
    })

    const resp = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
    if (!resp.ok) return null

    const data = await resp.json()
    const hourly = data.hourly

    if (!hourly?.temperature_2m?.length) return null

    // Use the hour closest to the activity start
    const idx = Math.min(hour, hourly.temperature_2m.length - 1)

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

export function weatherSummaryForPrompt(weather: WeatherData | null): string {
  if (!weather) return ''
  const tempF = Math.round(weather.temp_c * 9 / 5 + 32)
  return `Weather: ${weather.condition}, ${weather.temp_c}°C (${tempF}°F), wind ${weather.wind_kmh}km/h${weather.precipitation_mm > 0 ? `, ${weather.precipitation_mm}mm precipitation` : ''}.`
}
