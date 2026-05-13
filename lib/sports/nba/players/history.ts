/**
 * NBA player game history — full season traversal via completed team boxscores.
 *
 * Data flow:
 *   teams/{teamId}/schedule?season=YEAR  →  all completed game IDs
 *   summary?event={gameId}               →  per-athlete boxscore stats
 *
 * Caching (see cache.ts):
 *   Fresh (< 30 min)  → return cache as-is
 *   Stale (30 min–4 h) → incremental: only fetch new game summaries
 *   Expired (> 4 h)   → full refetch of all seasons
 *
 * Season coverage: full 3 ESPN seasons (preseason, regular, play-in, playoffs).
 * No per-season game cap — the file cache keeps subsequent loads instant.
 */

import type { NBAPlayerGame, NBASeasonType } from "./types";
import {
  readPlayerCache,
  writePlayerCache,
  FRESH_MS,
  TTL_MS,
} from "./cache";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const BATCH_SIZE = 10;

// ── Season-type mapping ───────────────────────────────────────────────────────

function mapSeasonType(ev: any): NBASeasonType | null {
  const type = Number(ev.season?.type ?? ev.seasonType ?? 0);
  const name  = String(ev.season?.type?.name ?? ev.season?.name ?? "").toLowerCase();
  if (type === 1 || name.includes("pre"))                                return "preseason";
  if (type === 2 || name.includes("regular"))                            return "regular";
  if (type === 3 || name.includes("post") || name.includes("playoff"))   return "playoffs";
  if (type === 5 || name.includes("play-in") || name.includes("playin")) return "playin";
  return null;
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

interface ScheduleGame {
  gameId:     string;
  date:       string;
  espnSeason: number;
  seasonType: NBASeasonType | null;
  opponent:   string;
  homeAway:   "home" | "away";
  result:     "W" | "L" | null;
  teamScore:  number | null;
  oppScore:   number | null;
}

async function fetchScheduleForSeason(teamId: string, year: number): Promise<any[]> {
  const url = `${BASE}/teams/${teamId}/schedule?season=${year}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events ?? [];
  } catch {
    return [];
  }
}

function extractCompletedGames(
  events:     any[],
  teamId:     string,
  espnSeason: number,
  afterDate?: string       // incremental: only include games after this date
): ScheduleGame[] {
  const games: ScheduleGame[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    if (comp.status?.type?.state !== "post") continue;

    const date = (ev.date ?? "").slice(0, 10);
    if (!date) continue;
    if (afterDate && date <= afterDate) continue;  // incremental filter

    const competitors: any[] = comp.competitors ?? [];
    const ours = competitors.find(
      (t: any) => String(t.id) === String(teamId) || String(t.team?.id) === String(teamId)
    );
    const opp = competitors.find(
      (t: any) => String(t.id) !== String(teamId) && String(t.team?.id) !== String(teamId)
    );
    if (!ours || !opp) continue;

    const ourScore = Number(ours.score ?? NaN);
    const oppScore = Number(opp.score  ?? NaN);
    const result: "W" | "L" | null = !isNaN(ourScore) && !isNaN(oppScore)
      ? ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : null
      : null;

    games.push({
      gameId:     String(ev.id),
      date,
      espnSeason,
      seasonType: mapSeasonType(ev),
      opponent:   opp.team?.displayName ?? opp.team?.shortDisplayName ?? "Unknown",
      homeAway:   ours.homeAway === "home" ? "home" : "away",
      result,
      teamScore:  isNaN(ourScore) ? null : ourScore,
      oppScore:   isNaN(oppScore)  ? null : oppScore,
    });
  }
  // newest-first within this season
  return games.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Summary / boxscore helpers ────────────────────────────────────────────────

async function fetchSummary(gameId: string): Promise<any | null> {
  const url = `${BASE}/summary?event=${gameId}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchSummariesBatched(games: ScheduleGame[]): Promise<(any | null)[]> {
  const results: (any | null)[] = [];
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE);
    const fetched = await Promise.all(batch.map(g => fetchSummary(g.gameId)));
    results.push(...fetched);
  }
  return results;
}

function parseShotSplit(raw: string | null | undefined): {
  m: number | null; a: number | null; pct: number | null;
} {
  if (!raw) return { m: null, a: null, pct: null };
  const dash = String(raw).indexOf("-");
  if (dash < 0) return { m: null, a: null, pct: null };
  const m = Number(raw.slice(0, dash));
  const a = Number(raw.slice(dash + 1));
  if (isNaN(m) || isNaN(a)) return { m: null, a: null, pct: null };
  return { m, a, pct: a > 0 ? Math.round((m / a) * 1000) / 10 : 0 };
}

function parseMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.includes(":")) {
    const [mStr = "0", sStr = "0"] = s.split(":");
    const m = Number(mStr), sec = Number(sStr);
    return !isNaN(m) && !isNaN(sec) ? Math.round(m + sec / 60) : null;
  }
  const n = Number(s);
  return isNaN(n) ? null : Math.round(n);
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function extractPlayerStats(
  summary:   any,
  athleteId: string
): Record<string, string | null> | null {
  const playersData: any[] = summary?.boxscore?.players ?? [];
  for (const teamData of playersData) {
    for (const statGroup of teamData.statistics ?? []) {
      const labels: string[] = statGroup.names ?? statGroup.labels ?? [];
      for (const entry of statGroup.athletes ?? []) {
        if (String(entry.athlete?.id ?? "") !== athleteId) continue;
        if (entry.didNotPlay || entry.active === false) return null;
        const vals: (string | null)[] = entry.stats ?? [];
        const map: Record<string, string | null> = {};
        labels.forEach((label, i) => { map[label] = vals[i] != null ? String(vals[i]) : null; });
        return map;
      }
    }
  }
  return null;
}

function buildPlayerGames(
  scheduleGames: ScheduleGame[],
  summaries:     (any | null)[],
  athleteId:     string
): NBAPlayerGame[] {
  const games: NBAPlayerGame[] = [];
  for (let i = 0; i < scheduleGames.length; i++) {
    const g   = scheduleGames[i];
    const sum = summaries[i];
    if (!sum) continue;
    const rawStats = extractPlayerStats(sum, athleteId);
    if (!rawStats) continue;

    const fg  = parseShotSplit(rawStats["FG"]);
    const fg3 = parseShotSplit(rawStats["3PT"]);
    const ft  = parseShotSplit(rawStats["FT"]);

    games.push({
      gameId:    g.gameId,
      date:      g.date,
      season:    g.espnSeason,
      seasonType: g.seasonType,
      opponent:  g.opponent,
      homeAway:  g.homeAway,
      result:    g.result,
      teamScore: g.teamScore,
      oppScore:  g.oppScore,
      minutes:   parseMinutes(rawStats["MIN"]),
      points:    num(rawStats["PTS"]),
      rebounds:  num(rawStats["REB"]),
      assists:   num(rawStats["AST"]),
      steals:    num(rawStats["STL"]),
      blocks:    num(rawStats["BLK"]),
      turnovers: num(rawStats["TO"]),
      fgm:  fg.m,  fga:  fg.a,  fgPct:  fg.pct,
      fg3m: fg3.m, fg3a: fg3.a, fg3Pct: fg3.pct,
      ftm:  ft.m,  fta:  ft.a,  ftPct:  ft.pct,
    });
  }
  return games;
}

function seasonsFromGames(games: NBAPlayerGame[]): number[] {
  const seen: Record<number, true> = {};
  for (const g of games) seen[g.season] = true;
  return Object.keys(seen).map(Number).sort((a, b) => b - a);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchNBAPlayerHistory(
  teamId:    string,
  athleteId: string
): Promise<{ games: NBAPlayerGame[]; seasonsIncluded: number[] }> {
  if (!teamId) return { games: [], seasonsIncluded: [] };

  const currentYear = new Date().getFullYear();

  // ── 1. Cache check ─────────────────────────────────────────────────────────
  const cached = await readPlayerCache(athleteId);

  if (cached && cached.entry.teamId === teamId) {
    const { entry, ageMs, isFresh, isStale } = cached;

    if (isFresh) {
      console.info(`[SportsPulse] NBA cache FRESH — athlete:${athleteId} games:${entry.games.length}`);
      return { games: entry.games, seasonsIncluded: entry.seasonsIncluded };
    }

    if (!isStale) {
      // ── 2. Incremental update: current season only ──────────────────────────
      const lastDate = entry.lastGameDate;
      if (lastDate) {
        console.info(
          `[SportsPulse] NBA cache INCREMENTAL — athlete:${athleteId} ` +
          `age:${Math.round(ageMs / 60000)}min lastGame:${lastDate}`
        );
        const currentEvents = await fetchScheduleForSeason(teamId, currentYear);
        const newScheduleGames = extractCompletedGames(
          currentEvents, teamId, currentYear, lastDate
        );

        if (newScheduleGames.length === 0) {
          // No new team games — refresh timestamp, return cached
          await writePlayerCache(athleteId, teamId, entry.games, entry.seasonsIncluded);
          return { games: entry.games, seasonsIncluded: entry.seasonsIncluded };
        }

        console.info(`[SportsPulse] NBA incremental — ${newScheduleGames.length} new team game(s) to check`);
        const newSummaries = await fetchSummariesBatched(newScheduleGames);
        const newPlayerGames = buildPlayerGames(newScheduleGames, newSummaries, athleteId);

        // Prepend new appearances (newest-first preserved)
        const allGames = [...newPlayerGames, ...entry.games];
        const seasonsIncluded = seasonsFromGames(allGames);
        await writePlayerCache(athleteId, teamId, allGames, seasonsIncluded);

        console.info(
          `[SportsPulse] NBA incremental DONE — athlete:${athleteId} ` +
          `new:${newPlayerGames.length} total:${allGames.length}`
        );
        return { games: allGames, seasonsIncluded };
      }
    }
  }

  // ── 3. Full fetch — all seasons, no game cap ───────────────────────────────
  const espnSeasons = [currentYear, currentYear - 1, currentYear - 2];

  console.info(
    `[SportsPulse] NBA FULL FETCH — team:${teamId} athlete:${athleteId} seasons:${espnSeasons.join(",")}`
  );

  // Fetch all season schedules in parallel
  const schedulesBySeason = await Promise.all(
    espnSeasons.map(year => fetchScheduleForSeason(teamId, year))
  );

  // Merge all completed games from all seasons, newest-first
  const allScheduleGames: ScheduleGame[] = schedulesBySeason
    .flatMap((events, i) => extractCompletedGames(events, teamId, espnSeasons[i]))
    .sort((a, b) => b.date.localeCompare(a.date));

  console.info(
    `[SportsPulse] NBA schedule traversal — athlete:${athleteId} ` +
    `total_completed:${allScheduleGames.length} across ${espnSeasons.join(",")}`
  );

  if (allScheduleGames.length === 0) {
    return { games: [], seasonsIncluded: [] };
  }

  // Fetch ALL summaries — no cap
  const allSummaries = await fetchSummariesBatched(allScheduleGames);

  // Extract this player's stats from each summary
  const playerGames = buildPlayerGames(allScheduleGames, allSummaries, athleteId);
  const seasonsIncluded = seasonsFromGames(playerGames);

  console.info(
    `[SportsPulse] NBA FULL FETCH DONE — athlete:${athleteId} ` +
    `appearances:${playerGames.length}/${allScheduleGames.length} ` +
    `seasons:${seasonsIncluded.join(",")}`
  );

  await writePlayerCache(athleteId, teamId, playerGames, seasonsIncluded);

  return { games: playerGames, seasonsIncluded };
}
