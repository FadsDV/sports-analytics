/**
 * Esports analytics layer — pure, deterministic, game-agnostic.
 *
 * All functions accept pre-fetched, normalized EsportsMatch arrays and return
 * computed results. No API calls, no side effects, no fabricated values.
 *
 * ── DATA LIMITATIONS ────────────────────────────────────────────────────────
 *
 * 1. Map-level detail (maps[]/games[]) is only present when matches are fetched
 *    individually via the detail endpoint (e.g. /csgo/matches/{id}).
 *    List endpoints (/csgo/matches/past) return series scores only.
 *    → getMapWinrates / getBestMaps / getWorstMaps return empty arrays for
 *      inputs sourced from list endpoints.
 *
 * 2. Player rosters embedded in match objects reflect the team's current lineup
 *    at ingest time, not the historical lineup at match time. PandaScore does
 *    not reliably preserve historical squad compositions in match payloads.
 *    → getRosterStability is a best-effort estimate; treat added[] as
 *      "unseen in sample", not necessarily "new signing".
 *
 * 3. winnerId on EsportsMatch uses canonical internal IDs (e.g. "cs2.navi").
 *    Map-level winnerId also uses canonical IDs. Mismatches between the team
 *    canonical ID construction in lib/sports/cs2/client.ts and
 *    lib/providers/esports/pandascore/normalization.ts may cause incorrect
 *    attribution. Both currently use slug-based IDs — verify if switching
 *    providers.
 *
 * 4. CS2 matches from PandaScore are listed as "csgo" in the API path but
 *    internally normalised to gameType "cs2".
 *
 * ── DESIGN CONSTRAINTS ──────────────────────────────────────────────────────
 *
 * - Minimum sample threshold: 2 matches for any rate (winRate, mapWinRate).
 *   Below threshold, rates are still computed but callers should display
 *   sample size for context. No hiding of low-N data — show it honestly.
 * - No percentile rankings, no composite scores, no weighted predictions.
 * - All rates are simple ratios. Display as percentages in UI.
 */

import type { EsportsMatch, EsportsTeam, EsportsPlayer } from "@/lib/esports/types";
import type {
  TeamForm,
  FormEntry,
  MapWinrate,
  HeadToHead,
  H2HEntry,
  RosterStability,
  SeenPlayer,
  MatchResult,
} from "./types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Returns only completed matches involving the given teamId. */
function matchesForTeam(teamId: string, matches: EsportsMatch[]): EsportsMatch[] {
  return matches.filter(
    m =>
      m.status === "completed" &&
      (m.homeTeam?.id === teamId || m.awayTeam?.id === teamId),
  );
}

/** Returns the opponent team for a given teamId within a match. */
function opponentOf(teamId: string, match: EsportsMatch): EsportsTeam | null {
  if (match.homeTeam?.id === teamId) return match.awayTeam;
  if (match.awayTeam?.id === teamId) return match.homeTeam;
  return null;
}

/** Returns "W" or "L" for teamId in a completed match. */
function resultFor(teamId: string, match: EsportsMatch): MatchResult {
  return match.winnerId === teamId ? "W" : "L";
}

/** Series score (maps won) for teamId in a match. */
function seriesScoreFor(
  teamId: string,
  match: EsportsMatch,
): { team: number; opponent: number } {
  const isHome = match.homeTeam?.id === teamId;
  const team     = isHome ? (match.score?.home ?? 0) : (match.score?.away ?? 0);
  const opponent = isHome ? (match.score?.away ?? 0) : (match.score?.home ?? 0);
  return { team, opponent };
}

/** Sorts matches by date descending (most recent first). */
function sortByDateDesc(matches: EsportsMatch[]): EsportsMatch[] {
  return [...matches].sort((a, b) => {
    const ta = a.endAt ?? a.scheduledAt ?? "";
    const tb = b.endAt ?? b.scheduledAt ?? "";
    return tb.localeCompare(ta);
  });
}

/** Safe mean of a numeric array. Returns 0 for empty arrays. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

// ─── 1. getTeamForm ───────────────────────────────────────────────────────────

/**
 * Computes form for a team over its most recent completed matches.
 *
 * @param teamId   Canonical internal team ID (e.g. "cs2.navi")
 * @param matches  Array of EsportsMatch — completed matches are filtered internally
 * @param limit    Maximum entries to include (default 10)
 */
export function getTeamForm(
  teamId: string,
  matches: EsportsMatch[],
  limit = 10,
): TeamForm {
  const relevant = sortByDateDesc(matchesForTeam(teamId, matches)).slice(0, limit);

  let wins = 0;
  let losses = 0;
  let mapsWon = 0;
  let mapsLost = 0;
  const entries: FormEntry[] = [];

  for (const m of relevant) {
    const result   = resultFor(teamId, m);
    const series   = seriesScoreFor(teamId, m);
    const opponent = opponentOf(teamId, m);

    if (result === "W") wins++;
    else losses++;

    mapsWon  += series.team;
    mapsLost += series.opponent;

    entries.push({
      matchId:         m.id,
      date:            m.endAt ?? m.scheduledAt ?? null,
      opponentId:      opponent?.id      ?? "unknown",
      opponentName:    opponent?.name    ?? "Unknown",
      opponentAcronym: opponent?.acronym ?? "???",
      result,
      seriesScore:     series,
      tournament:      m.tournament.leagueName ?? m.tournament.name,
    });
  }

  const total = wins + losses;
  const mapTotal = mapsWon + mapsLost;

  // Streak: consecutive identical results from entries[0]
  let streakType: MatchResult | null = entries[0]?.result ?? null;
  let streakCount = 0;
  for (const e of entries) {
    if (e.result === streakType) streakCount++;
    else break;
  }

  return {
    teamId,
    entries,
    wins,
    losses,
    winRate:    total > 0 ? wins / total : 0,
    streak:     { type: streakType, count: streakCount },
    mapsWon,
    mapsLost,
    mapWinRate: mapTotal > 0 ? mapsWon / mapTotal : 0,
    sampleSize: total,
  };
}

// ─── 2. getRecentMatches ─────────────────────────────────────────────────────

/**
 * Returns structured recent match entries for display, most recent first.
 * Equivalent to getTeamForm().entries but exposed as a standalone function.
 */
export function getRecentMatches(
  teamId: string,
  matches: EsportsMatch[],
  limit = 10,
): FormEntry[] {
  return getTeamForm(teamId, matches, limit).entries;
}

// ─── 3. getMapWinrates ───────────────────────────────────────────────────────

/**
 * Computes per-map win rates for a team.
 *
 * Only maps where `map.completed === true` and `map.name !== "TBA"` are counted.
 * Returns results sorted by totalPlayed descending.
 *
 * Returns an empty array when no map-level data is available — this is expected
 * when matches come from list endpoints. See data limitations above.
 */
export function getMapWinrates(
  teamId: string,
  matches: EsportsMatch[],
): MapWinrate[] {
  const relevant = matchesForTeam(teamId, matches);

  // map name → accumulated stats
  const stats = new Map<
    string,
    { wins: number; losses: number; scoresFor: number[]; scoresAgainst: number[] }
  >();

  for (const m of relevant) {
    if (!m.maps || m.maps.length === 0) continue;
    const isHome = m.homeTeam?.id === teamId;

    for (const map of m.maps) {
      if (!map.completed || map.name === "TBA") continue;

      const won        = map.winnerId === teamId;
      const scoreFor   = isHome ? map.homeScore : map.awayScore;
      const scoreAgainst = isHome ? map.awayScore : map.homeScore;

      if (!stats.has(map.name)) {
        stats.set(map.name, { wins: 0, losses: 0, scoresFor: [], scoresAgainst: [] });
      }
      const entry = stats.get(map.name)!;
      if (won) entry.wins++;
      else entry.losses++;
      entry.scoresFor.push(scoreFor);
      entry.scoresAgainst.push(scoreAgainst);
    }
  }

  const result: MapWinrate[] = Array.from(stats.entries()).map(([mapName, s]) => {
    const total = s.wins + s.losses;
    return {
      mapName,
      wins:            s.wins,
      losses:          s.losses,
      totalPlayed:     total,
      winRate:         total > 0 ? s.wins / total : 0,
      avgScoreFor:     mean(s.scoresFor),
      avgScoreAgainst: mean(s.scoresAgainst),
    };
  });

  return result.sort((a, b) => b.totalPlayed - a.totalPlayed);
}

// ─── 4. getBestMaps ──────────────────────────────────────────────────────────

/**
 * Returns maps with the highest win rate, requiring at least `minGames` played.
 * Sorted by winRate descending.
 */
export function getBestMaps(
  teamId: string,
  matches: EsportsMatch[],
  minGames = 2,
): MapWinrate[] {
  return getMapWinrates(teamId, matches)
    .filter(m => m.totalPlayed >= minGames)
    .sort((a, b) => b.winRate - a.winRate || b.totalPlayed - a.totalPlayed);
}

// ─── 5. getWorstMaps ─────────────────────────────────────────────────────────

/**
 * Returns maps with the lowest win rate, requiring at least `minGames` played.
 * Sorted by winRate ascending.
 */
export function getWorstMaps(
  teamId: string,
  matches: EsportsMatch[],
  minGames = 2,
): MapWinrate[] {
  return getMapWinrates(teamId, matches)
    .filter(m => m.totalPlayed >= minGames)
    .sort((a, b) => a.winRate - b.winRate || b.totalPlayed - a.totalPlayed);
}

// ─── 6. getHeadToHead ────────────────────────────────────────────────────────

/**
 * Computes head-to-head history between two teams from a match array.
 *
 * The match array should ideally contain historical matches involving either
 * team (e.g. a combined set of both teams' past matches).
 * Deduplication by matchId is applied so overlapping arrays are safe.
 */
export function getHeadToHead(
  teamAId: string,
  teamBId: string,
  matches: EsportsMatch[],
): HeadToHead {
  // Filter to completed matches involving BOTH teams
  const seen = new Set<string>();
  const h2h = sortByDateDesc(
    matches.filter(m => {
      if (m.status !== "completed")  return false;
      if (seen.has(m.id))            return false;
      const hasA = m.homeTeam?.id === teamAId || m.awayTeam?.id === teamAId;
      const hasB = m.homeTeam?.id === teamBId || m.awayTeam?.id === teamBId;
      if (hasA && hasB) { seen.add(m.id); return true; }
      return false;
    }),
  );

  let teamAWins = 0;
  let teamBWins = 0;
  let teamAMapWins = 0;
  let teamBMapWins = 0;
  const entries: H2HEntry[] = [];

  for (const m of h2h) {
    if (m.winnerId === teamAId) teamAWins++;
    else if (m.winnerId === teamBId) teamBWins++;

    // Map-level H2H wins (only when map data is available)
    if (m.maps) {
      for (const map of m.maps) {
        if (!map.completed) continue;
        if (map.winnerId === teamAId) teamAMapWins++;
        else if (map.winnerId === teamBId) teamBMapWins++;
      }
    }

    entries.push({
      matchId:     m.id,
      date:        m.endAt ?? m.scheduledAt ?? null,
      tournament:  m.tournament.leagueName ?? m.tournament.name,
      homeTeamId:  m.homeTeam?.id ?? "unknown",
      awayTeamId:  m.awayTeam?.id ?? "unknown",
      winnerId:    m.winnerId,
      seriesScore: { home: m.score?.home ?? 0, away: m.score?.away ?? 0 },
    });
  }

  return {
    teamAId,
    teamBId,
    teamAWins,
    teamBWins,
    total: h2h.length,
    teamAMapWins,
    teamBMapWins,
    entries,
  };
}

// ─── 7. getRosterStability ───────────────────────────────────────────────────

/**
 * Estimates roster stability by comparing the current team's player list
 * against players seen in recent match data.
 *
 * @param team          Current team object (with players populated)
 * @param matches       Recent match history for this team
 * @param limit         How many recent matches to examine (default 5)
 *
 * Limitations:
 * - Player data embedded in match objects reflects the roster at ingest time,
 *   not at match time. This is a PandaScore API constraint.
 * - If the current team object has no players[], the function still returns
 *   removed[] from match history with a stabilityScore of 0.
 */
export function getRosterStability(
  team: EsportsTeam,
  matches: EsportsMatch[],
  limit = 5,
): RosterStability {
  const teamId = team.id;
  const recent = sortByDateDesc(matchesForTeam(teamId, matches)).slice(0, limit);

  // Collect all players seen in recent matches for this team
  const seenMap = new Map<string, { handle: string; count: number }>();

  for (const m of recent) {
    const matchTeam = m.homeTeam?.id === teamId ? m.homeTeam : m.awayTeam;
    if (!matchTeam?.players) continue;
    for (const p of matchTeam.players) {
      const existing = seenMap.get(p.id);
      if (existing) existing.count++;
      else seenMap.set(p.id, { handle: p.handle, count: 1 });
    }
  }

  const currentIds = new Set((team.players ?? []).map(p => p.id));
  const seenIds    = new Set(seenMap.keys());

  const unchanged = Array.from(currentIds).filter(id => seenIds.has(id));
  const added     = Array.from(currentIds).filter(id => !seenIds.has(id));
  const removed   = Array.from(seenIds).filter(id => !currentIds.has(id));

  const currentRoster: SeenPlayer[] = (team.players ?? []).map(p => ({
    id:            p.id,
    handle:        p.handle,
    matchesPlayed: seenMap.get(p.id)?.count ?? 0,
  }));

  const stabilityScore =
    currentIds.size > 0 ? unchanged.length / currentIds.size : 0;

  return {
    teamId,
    currentRoster,
    unchanged,
    added,
    removed,
    stabilityScore,
    sampleSize: recent.length,
  };
}

// ─── Re-export types ─────────────────────────────────────────────────────────

export type {
  TeamForm,
  FormEntry,
  MapWinrate,
  HeadToHead,
  H2HEntry,
  RosterStability,
  SeenPlayer,
  MatchResult,
} from "./types";
