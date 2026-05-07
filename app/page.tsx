import { fetchESPNScoreboard, transformESPNEvent, ESPN_PATHS } from "@/lib/sports/espn";
import { fetchWeather } from "@/lib/sports/weather";
import { calcBetRisk } from "@/lib/sports/betRisk";
import { Game } from "@/lib/types";
import GameBrowser from "@/components/GameBrowser";

// NBA arenas that are indoors — weather irrelevant
const INDOOR_CITIES = new Set([
  "Boston", "Miami", "Chicago", "New York", "Brooklyn", "Denver",
  "Phoenix", "Dallas", "Houston", "Philadelphia", "Atlanta",
  "Cleveland", "Detroit", "Minneapolis", "Milwaukee", "Oklahoma City",
  "Portland", "Sacramento", "Charlotte", "Memphis", "San Antonio",
  "Orlando", "Washington", "Salt Lake City", "Indianapolis", "Toronto",
  "Golden State", "Los Angeles",
]);

function cityIsIndoor(city: string, sport: string): boolean {
  if (sport !== "basketball") return false;
  return Array.from(INDOOR_CITIES).some((c) => city.includes(c));
}

// All ESPN sport leagues to fetch
const ESPN_LEAGUES = [
  "soccer",
  "ucl",
  "uel",
  "laliga",
  "bundesliga",
  "aleague",
  "basketball",
  "afl",
] as const satisfies Array<keyof typeof ESPN_PATHS>;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { view?: string };
}) {
  // ── Fetch all sports in parallel ───────────────────────────────────
  const results = await Promise.all(ESPN_LEAGUES.map((l) => fetchESPNScoreboard(l)));

  // ── Transform all ESPN events ──────────────────────────────────────
  const allTransformed = ESPN_LEAGUES.flatMap((league, i) =>
    (results[i] ?? [])
      .map((e: any) => transformESPNEvent(e, league))
      .filter(Boolean)
  );

  // Deduplicate by event id
  const seenIds = new Set<string>();
  const allRaw: Array<Omit<Game, "weather" | "betRisk">> = allTransformed.filter((g: any) => {
    if (seenIds.has(g.id)) return false;
    seenIds.add(g.id);
    return true;
  }) as any;

  // ── Fetch weather per unique city (deduplicated) ────────────────────
  const uniqueCities = Array.from(new Set(allRaw.map((g) => g.city)));
  const weatherMap = Object.fromEntries(
    await Promise.all(
      uniqueCities.map(async (city) => [
        city,
        await fetchWeather(city, cityIsIndoor(city, "")),
      ])
    )
  );

  // ── Enrich with weather + bet risk ─────────────────────────────────
  const games: Game[] = allRaw.map((g) => {
    const indoor  = cityIsIndoor(g.city, g.sport);
    const weather = weatherMap[g.city] ?? { condition: "Clear", tempC: 20, windKph: 10, humidity: 60 };
    const actualWeather = indoor ? { condition: "Indoor", tempC: 21, windKph: 0, humidity: 45 } : weather;
    const betRisk = calcBetRisk(g.homeTeam, g.awayTeam, actualWeather, 0, 0, 0);
    return { ...g, weather: actualWeather, betRisk } as Game;
  });

  // ── Sort: live → upcoming (by date) → finished (most recent first) ─
  games.sort((a, b) => {
    const order = { live: 0, upcoming: 1, finished: 2 };
    const diff  = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    const ta = new Date(a.kickoff).getTime();
    const tb = new Date(b.kickoff).getTime();
    return a.status === "finished" ? tb - ta : ta - tb;
  });

  const view = searchParams?.view ?? "today";
  return (
    <div className="h-full flex flex-col">
      <GameBrowser games={games} initialView={view} key={view} />
    </div>
  );
}
