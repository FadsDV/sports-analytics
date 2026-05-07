import type { ESPNGameLogEntry } from "@/lib/sports/espnPlayers";
import type { AFLPlayerGame } from "./types";

function pickStat(
  stats: Record<string, string | number | null>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const v = stats[key];
    if (v != null && v !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function parseResult(
  resultStr: string | null
): { result: "W" | "L" | "D" | null; teamScore: number | null; oppScore: number | null } {
  if (!resultStr) return { result: null, teamScore: null, oppScore: null };
  const letter = resultStr.trim()[0]?.toUpperCase();
  const result: "W" | "L" | "D" | null =
    letter === "W" ? "W" : letter === "L" ? "L" : letter === "D" ? "D" : null;

  // Parse scores like "W 88-72" or "L 65-70"
  const scoreMatch = resultStr.match(/(\d+)[-–](\d+)/);
  if (scoreMatch) {
    return {
      result,
      teamScore: Number(scoreMatch[1]),
      oppScore: Number(scoreMatch[2]),
    };
  }
  return { result, teamScore: null, oppScore: null };
}

function computeFantasy(
  kicks: number | null,
  handballs: number | null,
  marks: number | null,
  tackles: number | null,
  goals: number | null,
  behinds: number | null,
  hitouts: number | null,
  freesFor: number | null,
  freesAgainst: number | null
): number | null {
  // Need at least some stats to compute fantasy
  if (
    kicks == null &&
    handballs == null &&
    marks == null &&
    tackles == null &&
    goals == null
  ) {
    return null;
  }
  return (
    (kicks ?? 0) * 3 +
    (handballs ?? 0) * 2 +
    (marks ?? 0) * 3 +
    (tackles ?? 0) * 4 +
    (goals ?? 0) * 8 +
    (behinds ?? 0) * 1 +
    (hitouts ?? 0) * 1 +
    (freesFor ?? 0) * 1 +
    (freesAgainst ?? 0) * -3
  );
}

export function normalizeAFLGameLog(entries: ESPNGameLogEntry[]): AFLPlayerGame[] {
  return entries
    .filter((e) => Boolean(e.date))
    .map((e) => {
      const stats = e.stats;

      const kicks = pickStat(stats, ["K", "kicks", "Kicks"]);
      const handballs = pickStat(stats, ["HB", "handballs", "Handballs"]);
      const marks = pickStat(stats, ["M", "marks", "Marks"]);
      const tackles = pickStat(stats, ["T", "tackles", "Tackles"]);
      const goals = pickStat(stats, ["G", "goals", "Goals"]);
      const behinds = pickStat(stats, ["B", "behinds", "Behinds"]);
      const hitouts = pickStat(stats, ["HO", "hitouts", "Hitouts"]);
      const freesFor = pickStat(stats, ["FF", "freesFor", "FreesFor"]);
      const freesAgainst = pickStat(stats, ["FA", "freesAgainst", "FreesAgainst"]);
      const contestedPoss = pickStat(stats, ["CP", "contestedPossessions", "ContPoss"]);

      // Disposals: try direct key first, then compute from kicks + handballs
      let disposals = pickStat(stats, ["D", "disposals", "Disposals", "disp"]);
      if (disposals == null && kicks != null && handballs != null) {
        disposals = kicks + handballs;
      }

      const fantasyScore = computeFantasy(
        kicks, handballs, marks, tackles, goals, behinds, hitouts, freesFor, freesAgainst
      );

      const dateStr = e.date ?? "1970-01-01";
      const season = parseInt(dateStr.slice(0, 4), 10) || new Date().getFullYear();

      const { result, teamScore, oppScore } = parseResult(e.result);

      return {
        gameId: e.gameId,
        date: dateStr,
        season,
        opponent: e.opponent ?? "Unknown",
        homeAway: e.homeAway === "away" ? "away" : "home",
        result,
        teamScore,
        oppScore,
        disposals,
        kicks,
        handballs,
        marks,
        tackles,
        goals,
        behinds,
        hitouts,
        contestedPoss,
        freesFor,
        freesAgainst,
        fantasyScore,
        raw: stats,
      } satisfies AFLPlayerGame;
    });
}
