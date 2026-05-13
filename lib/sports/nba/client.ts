/**
 * ESPN NBA team season stats fetcher.
 * Returns per-game season averages for shooting, rebounding, and ball movement.
 * All stats are real ESPN data — no fabricated values.
 */

import type { NBASeasonStats } from "./analytics";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

export async function fetchNBASeasonStats(teamId: string): Promise<NBASeasonStats | null> {
  try {
    const url = `${BASE}/teams/${teamId}?enable=stats`;
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return null;
    const data = await res.json();

    // ESPN wraps stats under different paths depending on season state
    const categories: any[] =
      data.team?.statistics?.splits?.categories ??
      data.team?.statistics?.categories ??
      [];

    if (categories.length === 0) return null;

    const allStats: Record<string, number> = {};
    for (const cat of categories) {
      for (const s of (cat.stats ?? [])) {
        if (s.name && s.value != null) {
          allStats[s.name] = Number(s.value);
        }
      }
    }

    if (Object.keys(allStats).length === 0) return null;

    const pick = (...keys: string[]): number | null => {
      for (const k of keys) {
        if (allStats[k] != null) return allStats[k];
      }
      return null;
    };

    return {
      ppg:      pick("avgPoints", "pointsPerGame", "points"),
      oppPpg:   pick("avgOpponentPoints", "opponentPoints"),
      fgPct:    pick("fieldGoalPct", "avgFieldGoalPct"),
      threePct: pick("threePointFieldGoalPct", "avgThreePointFieldGoalPct"),
      ftPct:    pick("freeThrowPct", "avgFreeThrowPct"),
      rpg:      pick("avgRebounds", "reboundsPerGame", "rebounds"),
      apg:      pick("avgAssists", "assistsPerGame", "assists"),
      tpg:      pick("avgTurnovers", "turnoversPerGame", "turnovers"),
      spg:      pick("avgSteals", "stealsPerGame", "steals"),
      bpg:      pick("avgBlocks", "blocksPerGame", "blocks"),
    };
  } catch {
    return null;
  }
}
