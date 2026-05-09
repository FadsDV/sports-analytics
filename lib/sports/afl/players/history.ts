/**
 * Builds AFL player game history by aggregating per-match boxscores.
 * ESPN's AFL API has no gamelog endpoint — stats live in event summaries.
 */

import type { AFLPlayerGame } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/australian-football/afl";

// ─── Schedule helpers ─────────────────────────────────────────────────────────

interface ScheduleGame {
  gameId:    string;
  date:      string;        // "YYYY-MM-DD"
  opponent:  string;
  homeAway:  "home" | "away";
  result:    "W" | "L" | "D" | null;
  teamScore: number | null;
  oppScore:  number | null;
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

function extractCompletedGames(events: any[], teamId: string): ScheduleGame[] {
  const games: ScheduleGame[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    if (comp.status?.type?.state !== "post") continue;
    // Skip pre-season
    const seasonType = ev.season?.type ?? ev.seasonType;
    if (seasonType === 1 || seasonType === "1") continue;

    const competitors: any[] = comp.competitors ?? [];
    const ours = competitors.find((t: any) => String(t.id) === String(teamId));
    const opp  = competitors.find((t: any) => String(t.id) !== String(teamId));
    if (!ours || !opp) continue;

    const ourScore = Number(ours.score ?? NaN);
    const oppScore = Number(opp.score  ?? NaN);
    const result: "W" | "L" | "D" | null = !isNaN(ourScore) && !isNaN(oppScore)
      ? ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : "D"
      : null;

    games.push({
      gameId:    String(ev.id),
      date:      (ev.date ?? "").slice(0, 10),
      opponent:  opp.team?.displayName ?? opp.team?.shortDisplayName ?? "Unknown",
      homeAway:  (ours.homeAway === "home" ? "home" : "away") as "home" | "away",
      result,
      teamScore: isNaN(ourScore) ? null : ourScore,
      oppScore:  isNaN(oppScore)  ? null : oppScore,
    });
  }
  return games;
}

// ─── Summary boxscore helpers ─────────────────────────────────────────────────

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

function extractPlayerStats(
  summary: any,
  athleteId: string,
): Record<string, number | null> | null {
  const playersData: any[] = summary?.boxscore?.players ?? [];

  for (const teamData of playersData) {
    for (const statGroup of teamData.statistics ?? []) {
      const labels: string[] = statGroup.labels ?? [];
      for (const entry of statGroup.athletes ?? []) {
        if (String(entry.athlete?.id ?? "") !== athleteId) continue;
        const vals: string[] = entry.stats ?? [];
        const map: Record<string, number | null> = {};
        labels.forEach((label, i) => {
          const raw = vals[i];
          const n   = Number(raw);
          map[label] = raw != null && raw !== "" && !isNaN(n) ? n : null;
        });
        return map;
      }
    }
  }
  return null;
}

// ─── AFL fantasy score (SuperCoach) ─────────────────────────────────────────

function computeFantasy(s: Record<string, number | null>): number {
  const n = (k: string) => s[k] ?? 0;
  return (
    n("K")  * 3 +
    n("H")  * 2 +  // H = Handballs in ESPN AFL labels
    n("M")  * 3 +
    n("T")  * 4 +
    n("G")  * 8 +
    n("B")  * 1 +
    n("HO") * 1 +
    n("FF") * 1 +
    n("FA") * -3
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchAFLPlayerHistory(
  teamId:    string,
  athleteId: string,
  seasons:   number[],
): Promise<AFLPlayerGame[]> {
  // 1. Fetch team schedules for all seasons
  const schedulesBySeason = await Promise.all(
    seasons.map(year => fetchScheduleForSeason(teamId, year))
  );

  // 2. Collect completed games, newest first, capped at 15
  const allGames: ScheduleGame[] = schedulesBySeason
    .flatMap(events => extractCompletedGames(events, teamId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);

  if (allGames.length === 0) return [];

  // 3. Fetch summaries in batches of 5 to avoid ESPN rate limiting
  const BATCH_SIZE = 5;
  const summaries: (any | null)[] = [];
  for (let i = 0; i < allGames.length; i += BATCH_SIZE) {
    const batch = allGames.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(g => fetchSummary(g.gameId)));
    summaries.push(...results);
  }

  // 4. Build AFLPlayerGame[] by extracting player stats from each summary
  const result: AFLPlayerGame[] = [];
  for (let i = 0; i < allGames.length; i++) {
    const g   = allGames[i];
    const sum = summaries[i];
    if (!sum) continue;

    const stats = extractPlayerStats(sum, athleteId);
    if (!stats) continue;    // Player didn't appear in this game

    const kicks     = stats["K"]  ?? null;
    const handballs = stats["H"]  ?? null;
    const disposals = stats["D"]  ?? (kicks != null && handballs != null ? kicks + handballs : null);
    const fantasy   = stats["SC"] ?? computeFantasy(stats);

    result.push({
      gameId:         g.gameId,
      date:           g.date,
      season:         parseInt(g.date.slice(0, 4)) || seasons[0],
      opponent:       g.opponent,
      homeAway:       g.homeAway,
      result:         g.result,
      teamScore:      g.teamScore,
      oppScore:       g.oppScore,
      disposals,
      kicks,
      handballs,
      marks:          stats["M"]  ?? null,
      tackles:        stats["T"]  ?? null,
      goals:          stats["G"]  ?? null,
      behinds:        stats["B"]  ?? null,
      hitouts:        stats["HO"] ?? null,
      contestedPoss:  stats["CP"] ?? null,
      freesFor:       stats["FF"] ?? null,
      freesAgainst:   stats["FA"] ?? null,
      fantasyScore:   fantasy,
      raw:            stats,
    });
  }

  return result;
}
