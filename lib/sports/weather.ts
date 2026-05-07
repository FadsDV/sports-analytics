/**
 * Open-Meteo weather API — completely free, no API key required.
 * https://open-meteo.com
 */

import { Weather } from "@/lib/types";

// WMO weather codes → human-readable condition
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

// City/venue string → [latitude, longitude]
// Covers all major sports cities used by ESPN + Squiggle venues.
const COORDS: Record<string, [number, number]> = {
  // Australian AFL venues
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

function findCoords(city: string): [number, number] | null {
  if (!city) return null;
  const lower = city.toLowerCase();
  for (const [key, coords] of Object.entries(COORDS)) {
    if (lower.includes(key.toLowerCase())) return coords;
  }
  return null;
}

export async function fetchWeather(city: string, isIndoor = false): Promise<Weather> {
  // Indoor venues (NBA arenas, etc.) don't need real weather
  if (isIndoor) {
    return { condition: "Indoor", tempC: 21, windKph: 0, humidity: 45 };
  }

  const coords = findCoords(city);
  if (!coords) {
    return { condition: "Clear", tempC: 20, windKph: 10, humidity: 60 };
  }

  const [lat, lon] = coords;
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
