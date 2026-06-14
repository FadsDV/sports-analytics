/**
 * Weather API layer.
 *
 * - Australian AFL venues/cities → Bureau of Meteorology (BOM) public API
 *   https://api.weather.bom.gov.au/v1
 * - All other sports → Open-Meteo (free, no API key)
 *   https://open-meteo.com
 */

import { Weather } from "@/lib/types";

// ─── WMO weather code → condition (Open-Meteo) ───────────────────────────────

function wmoCondition(code: number): string {
  if (code === 0)           return "Clear";
  if (code <= 3)            return "Partly Cloudy";
  if (code <= 48)           return "Foggy";
  if (code <= 57)           return "Drizzle";
  if (code <= 67)           return "Rain";
  if (code <= 77)           return "Snow";
  if (code <= 82)           return "Rain Showers";
  if (code <= 86)           return "Snow Showers";
  if (code >= 95)           return "Storm";
  return "Cloudy";
}

// ─── BOM icon_descriptor → condition ─────────────────────────────────────────

function bomCondition(icon: string): string {
  switch (icon) {
    case "sunny":
    case "clear":
      return "Clear";
    case "mostly_sunny":
    case "partly_cloudy":
    case "mostly_cloudy_chance_shower":
      return "Partly Cloudy";
    case "cloudy":
    case "overcast":
    case "mostly_cloudy":
      return "Cloudy";
    case "shower":
    case "rain":
    case "heavy_shower":
    case "light_shower":
      return "Rain";
    case "drizzle":
    case "light_rain":
      return "Drizzle";
    case "thunderstorm":
    case "storm":
      return "Storm";
    case "wind":
      return "Windy";
    case "fog":
    case "haze":
    case "frost":
      return "Foggy";
    default:
      return "Partly Cloudy";
  }
}

// ─── Coordinate lookup map ────────────────────────────────────────────────────
// City/venue string → [latitude, longitude]
// Covers all major sports cities used by ESPN + Squiggle venues.

const COORDS: Record<string, [number, number]> = {
  // AFL named venues (matched before city names due to longer keys)
  "Optus Stadium":    [-31.951,  115.889],
  "MCG":              [-37.820,  144.983],
  "Marvel Stadium":   [-37.817,  144.952],
  "Adelaide Oval":    [-34.916,  138.596],
  "Gabba":            [-27.485,  153.038],
  "SCG":              [-33.891,  151.225],
  "GIANTS Stadium":   [-33.847,  150.790],
  "Engie Stadium":    [-33.847,  150.790],
  "GMHBA Stadium":    [-38.157,  144.354],
  "UTAS Stadium":     [-41.447,  147.131],
  "Manuka Oval":      [-35.319,  149.137],
  "Blundstone Arena": [-42.887,  147.331],
  "TIO Stadium":      [-12.389,  130.881],
  "Traeger Park":     [-23.699,  133.880],
  "Cazaly's Stadium": [-16.921,  145.765],
  "Mars Stadium":     [-37.570,  143.850],
  "Victoria Park":    [-37.820,  144.983],
  "Docklands":        [-37.817,  144.952],
  // Australian AFL cities
  "Melbourne":        [-37.81,  144.96],
  "Geelong":          [-38.15,  144.36],
  "Sydney":           [-33.87,  151.21],
  "Brisbane":         [-27.47,  153.03],
  "Perth":            [-31.95,  115.86],
  "Adelaide":         [-34.93,  138.60],
  "Gold Coast":       [-28.02,  153.40],
  "Canberra":         [-35.28,  149.13],
  "Darwin":           [-12.46,  130.85],
  "Hobart":           [-42.88,  147.33],
  "Alice Springs":    [-23.70,  133.88],
  // UK soccer
  "London":           [ 51.51,   -0.13],
  "Manchester":       [ 53.48,   -2.24],
  "Liverpool":        [ 53.41,   -2.99],
  "Birmingham":       [ 52.49,   -1.89],
  "Newcastle":        [ 54.98,   -1.62],
  "Leeds":            [ 53.80,   -1.55],
  "Leicester":        [ 52.64,   -1.14],
  "Sheffield":        [ 53.38,   -1.47],
  "Southampton":      [ 50.91,   -1.40],
  "Nottingham":       [ 52.95,   -1.14],
  "Brighton":         [ 50.83,   -0.14],
  "Wolverhampton":    [ 52.59,   -2.11],
  "Brentford":        [ 51.49,   -0.31],
  "Fulham":           [ 51.47,   -0.22],
  "Ipswich":          [ 52.05,    1.14],
  "Burnley":          [ 53.79,   -2.23],
  "Luton":            [ 51.88,   -0.41],
  // US — NBA
  "Los Angeles":      [ 34.05, -118.24],
  "Golden State":     [ 37.77, -122.39],
  "San Francisco":    [ 37.77, -122.42],
  "Boston":           [ 42.36,  -71.06],
  "Miami":            [ 25.76,  -80.19],
  "Chicago":          [ 41.88,  -87.63],
  "New York":         [ 40.71,  -74.01],
  "Brooklyn":         [ 40.68,  -73.94],
  "Denver":           [ 39.74, -104.99],
  "Phoenix":          [ 33.45, -112.07],
  "Dallas":           [ 32.78,  -96.80],
  "Houston":          [ 29.76,  -95.37],
  "Philadelphia":     [ 39.95,  -75.17],
  "Atlanta":          [ 33.75,  -84.39],
  "Cleveland":        [ 41.50,  -81.69],
  "Detroit":          [ 42.33,  -83.05],
  "Minneapolis":      [ 44.98,  -93.27],
  "Milwaukee":        [ 43.04,  -87.91],
  "Oklahoma City":    [ 35.47,  -97.52],
  "Portland":         [ 45.51, -122.68],
  "Sacramento":       [ 38.58, -121.49],
  "Charlotte":        [ 35.23,  -80.84],
  "Memphis":          [ 35.15,  -90.05],
  "San Antonio":      [ 29.42,  -98.49],
  "Orlando":          [ 28.54,  -81.38],
  "Washington":       [ 38.91,  -77.04],
  "Salt Lake City":   [ 40.76, -111.89],
  "Indianapolis":     [ 39.77,  -86.16],
  "Toronto":          [ 43.65,  -79.38],
  // US — NFL
  "Kansas City":      [ 39.10,  -94.58],
  "Pittsburgh":       [ 40.44,  -79.99],
  "Green Bay":        [ 44.51,  -88.01],
  "Seattle":          [ 47.61, -122.33],
  "New Orleans":      [ 29.95,  -90.07],
  "Buffalo":          [ 42.89,  -78.88],
  "Baltimore":        [ 39.29,  -76.61],
  "Cincinnati":       [ 39.10,  -84.51],
  "Jacksonville":     [ 30.33,  -81.66],
  "Nashville":        [ 36.17,  -86.78],
  "Las Vegas":        [ 36.17, -115.14],
  "Inglewood":        [ 33.96, -118.35],
  "Foxborough":       [ 42.09,  -71.26],
  "Glendale":         [ 33.53, -112.26],
  "Tampa":            [ 27.95,  -82.46],
  "Santa Clara":      [ 37.40, -121.97],
  "Landover":         [ 38.91,  -76.86],
  "East Rutherford":  [ 40.81,  -74.07],
  "Orchard Park":     [ 42.77,  -78.79],
};

// ─── Australian city/venue detection ─────────────────────────────────────────

// All keys in COORDS that belong to Australian AFL venues or cities
// (first 29 entries up to and including "Alice Springs")
const AUSTRALIAN_KEYS = new Set([
  "Optus Stadium", "MCG", "Marvel Stadium", "Adelaide Oval", "Gabba", "SCG",
  "GIANTS Stadium", "Engie Stadium", "GMHBA Stadium", "UTAS Stadium",
  "Manuka Oval", "Blundstone Arena", "TIO Stadium", "Traeger Park",
  "Cazaly's Stadium", "Mars Stadium", "Victoria Park", "Docklands",
  "Melbourne", "Geelong", "Sydney", "Brisbane", "Perth", "Adelaide",
  "Gold Coast", "Canberra", "Darwin", "Hobart", "Alice Springs",
]);

export function isAustralianCity(city: string): boolean {
  if (!city) return false;
  const lower = city.toLowerCase();
  // Try longest key first so venues beat city names
  const sorted = Array.from(AUSTRALIAN_KEYS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (lower.includes(key.toLowerCase())) return true;
  }
  return false;
}

// ─── Coordinate lookup ────────────────────────────────────────────────────────

function findCoords(city: string): [number, number] | null {
  if (!city) return null;
  const lower = city.toLowerCase();
  // Try longest key match first (venue names beat city names)
  const entries = Object.entries(COORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, coords] of entries) {
    if (lower.includes(key.toLowerCase())) return coords;
  }
  return null;
}

// ─── BOM API ──────────────────────────────────────────────────────────────────

const BOM_BASE = "https://api.weather.bom.gov.au/v1";

async function bomGeohash(cityOrVenue: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(cityOrVenue);
    const res = await fetch(`${BOM_BASE}/locations?search=${query}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.data?.[0];
    return first?.geohash ?? null;
  } catch {
    return null;
  }
}

async function fetchWeatherBOM(cityOrVenue: string, gameTime?: Date): Promise<Weather> {
  const geohash = await bomGeohash(cityOrVenue);
  if (!geohash) throw new Error("BOM: geohash not found");

  const now = new Date();
  const useForecast = gameTime != null && gameTime.getTime() - now.getTime() > 60 * 60 * 1000; // > 1h future

  if (useForecast) {
    // Fetch 3-hourly forecast and find the slot closest to kickoff
    const res = await fetch(`${BOM_BASE}/locations/${geohash}/forecasts/3-hourly`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error("BOM forecast failed");
    const json = await res.json();
    const slots: Array<{
      time: string;
      temp: number;
      wind: { speed_kilometre: number };
      icon_descriptor: string;
      humidity: number;
    }> = json?.data ?? [];

    if (!slots.length) throw new Error("BOM: no forecast slots");

    // Find the slot with the smallest time delta to kickoff
    const target = gameTime.getTime();
    let best = slots[0]!;
    let bestDelta = Math.abs(new Date(best.time).getTime() - target);
    for (const slot of slots) {
      const delta = Math.abs(new Date(slot.time).getTime() - target);
      if (delta < bestDelta) { bestDelta = delta; best = slot; }
    }

    return {
      condition: bomCondition(best.icon_descriptor),
      tempC:     Math.round(best.temp ?? 20),
      windKph:   Math.round(best.wind?.speed_kilometre ?? 10),
      humidity:  Math.round(best.humidity ?? 60),
    };
  }

  // Current / recent — use observations for temp/wind/humidity, 3-hourly for condition
  const [obsRes, fcstRes] = await Promise.all([
    fetch(`${BOM_BASE}/locations/${geohash}/observations`, { next: { revalidate: 900 } }),
    fetch(`${BOM_BASE}/locations/${geohash}/forecasts/3-hourly`, { next: { revalidate: 1800 } }),
  ]);

  if (!obsRes.ok) throw new Error("BOM observations failed");
  const obsJson = await obsRes.json();
  const obs = obsJson?.data ?? {};

  // Condition from the first forecast slot (closest to now)
  let condition = "Partly Cloudy";
  if (fcstRes.ok) {
    const fcstJson = await fcstRes.json();
    const firstSlot = fcstJson?.data?.[0];
    if (firstSlot?.icon_descriptor) {
      condition = bomCondition(firstSlot.icon_descriptor);
    }
  }

  return {
    condition,
    tempC:   Math.round(obs.temp         ?? 20),
    windKph: Math.round(obs.wind?.speed_kilometre ?? 10),
    humidity: Math.round(obs.humidity    ?? 60),
  };
}

// ─── Open-Meteo fallback ──────────────────────────────────────────────────────

async function fetchWeatherOpenMeteo(city: string, gameTime?: Date): Promise<Weather> {
  const coords = findCoords(city);
  if (!coords) {
    return { condition: "Clear", tempC: 20, windKph: 10, humidity: 60 };
  }

  const [lat, lon] = coords;

  // If gameTime is more than 1h in the future, use hourly forecast
  const now = new Date();
  const useForecast = gameTime != null && gameTime.getTime() - now.getTime() > 60 * 60 * 1000;

  if (useForecast) {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code` +
      `&wind_speed_unit=kmh&temperature_unit=celsius&forecast_days=7`;

    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error("open-meteo hourly failed");
      const data = await res.json();
      const times: string[] = data.hourly?.time ?? [];
      const temps: number[] = data.hourly?.temperature_2m ?? [];
      const winds: number[] = data.hourly?.wind_speed_10m ?? [];
      const hums:  number[] = data.hourly?.relative_humidity_2m ?? [];
      const codes: number[] = data.hourly?.weather_code ?? [];

      const target = gameTime.getTime();
      let bestIdx = 0;
      let bestDelta = Infinity;
      for (let i = 0; i < times.length; i++) {
        const delta = Math.abs(new Date(times[i]!).getTime() - target);
        if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
      }

      return {
        condition: wmoCondition(codes[bestIdx] ?? 0),
        tempC:     Math.round(temps[bestIdx] ?? 20),
        windKph:   Math.round(winds[bestIdx] ?? 10),
        humidity:  Math.round(hums[bestIdx]  ?? 60),
      };
    } catch {
      return { condition: "Clear", tempC: 20, windKph: 10, humidity: 60 };
    }
  }

  // Current conditions
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code` +
    `&wind_speed_unit=kmh&temperature_unit=celsius`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30 min cache
    if (!res.ok) throw new Error("open-meteo failed");
    const data  = await res.json();
    const cur   = data.current ?? {};
    return {
      condition: wmoCondition(cur.weather_code ?? 0),
      tempC:     Math.round(cur.temperature_2m    ?? 20),
      windKph:   Math.round(cur.wind_speed_10m    ?? 10),
      humidity:  Math.round(cur.relative_humidity_2m ?? 60),
    };
  } catch {
    return { condition: "Clear", tempC: 20, windKph: 10, humidity: 60 };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchWeather(
  city: string,
  isIndoor = false,
  gameTime?: Date,
): Promise<Weather> {
  // Indoor venues (NBA arenas, etc.) don't need real weather
  if (isIndoor) {
    return { condition: "Indoor", tempC: 21, windKph: 0, humidity: 45 };
  }

  // Route Australian AFL venues/cities to BOM, fall back to Open-Meteo on failure
  if (isAustralianCity(city)) {
    try {
      return await fetchWeatherBOM(city, gameTime);
    } catch {
      // BOM failed — fall through to Open-Meteo
    }
  }

  return fetchWeatherOpenMeteo(city, gameTime);
}
