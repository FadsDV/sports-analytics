/**
 * NBA player pick generation.
 * Analyses last-5 game box scores per player and produces reliability-ranked
 * OVER props for points, rebounds, assists, 3-pointers, steals, blocks.
 */

import type { NBAGamePlayerStats } from "@/lib/sports/espn";

// ─── Public types ─────────────────────────────────────────────────────────────

export type NBAPickStat = "PTS" | "REB" | "AST" | "FG3M" | "STL" | "BLK";

export interface NBAPlayerPick {
  player:        string;
  side:          "home" | "away";
  teamAbbr:      string;
  stat:          NBAPickStat;
  statLabel:     string;
  direction:     "over";
  threshold:     number;
  hitRate:       number;   // 0–1
  avgStat:       number;
  gamesAnalyzed: number;
  confidence:    "high" | "medium" | "low";
}

// ─── Internal config ──────────────────────────────────────────────────────────

const STAT_LABELS: Record<NBAPickStat, string> = {
  PTS:  "points",
  REB:  "rebounds",
  AST:  "assists",
  FG3M: "threes",
  STL:  "steals",
  BLK:  "blocks",
};

// Importance weight for ranking — most-bet markets first
const STAT_WEIGHTS: Record<NBAPickStat, number> = {
  PTS:  1.00,
  REB:  0.90,
  AST:  0.85,
  FG3M: 0.80,
  STL:  0.60,
  BLK:  0.55,
};

// Minimum season average to even evaluate a pick
const MIN_AVG: Record<NBAPickStat, number> = {
  PTS:  8,
  REB:  3,
  AST:  2,
  FG3M: 0.8,
  STL:  0.3,
  BLK:  0.3,
};

// Step size for threshold search
const STEP: Record<NBAPickStat, number> = {
  PTS:  1,
  REB:  1,
  AST:  1,
  FG3M: 0.5,
  STL:  0.5,
  BLK:  0.5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

function hitRate(vals: number[], threshold: number): number {
  if (!vals.length) return 0;
  return vals.filter(v => v >= threshold).length / vals.length;
}

function confidence(hr: number, games: number): "high" | "medium" | "low" {
  if (hr >= 0.80 && games >= 4) return "high";
  if (hr >= 0.70 && games >= 3) return "medium";
  return "low";
}

function pickScore(p: NBAPlayerPick): number {
  return p.hitRate * Math.min(p.gamesAnalyzed / 5, 1) * STAT_WEIGHTS[p.stat];
}

// ─── Player history builder ───────────────────────────────────────────────────

interface PlayerHistory {
  name:     string;
  side:     "home" | "away";
  teamAbbr: string;
  games:    Array<Record<NBAPickStat, number>>;
}

function buildPlayerHistories(
  gamesByGame: NBAGamePlayerStats[][],
  teamId:      string,
  side:        "home" | "away",
  teamAbbr:    string,
): PlayerHistory[] {
  const map = new Map<string, PlayerHistory>();

  for (const gamePlayers of gamesByGame) {
    const teamPlayers = gamePlayers.filter(p => p.teamId === teamId);
    for (const p of teamPlayers) {
      if (!map.has(p.name)) {
        map.set(p.name, { name: p.name, side, teamAbbr, games: [] });
      }
      map.get(p.name)!.games.push({
        PTS: p.PTS, REB: p.REB, AST: p.AST,
        FG3M: p.FG3M, STL: p.STL, BLK: p.BLK,
      });
    }
  }

  return Array.from(map.values()).filter(h => h.games.length >= 3);
}

// ─── Pick generation for one player ──────────────────────────────────────────

function picksForPlayer(h: PlayerHistory): NBAPlayerPick[] {
  const picks: NBAPlayerPick[] = [];
  const STATS: NBAPickStat[] = ["PTS", "REB", "AST", "FG3M", "STL", "BLK"];

  for (const stat of STATS) {
    const vals = h.games.map(g => g[stat]);
    const avg  = mean(vals);
    if (avg < MIN_AVG[stat]) continue;

    const sd   = stddev(vals);
    const step = STEP[stat];
    const minThr = step === 0.5
      ? Math.round((avg * 0.5) * 2) / 2
      : Math.round(avg * 0.6);

    let bestHR  = 0;
    let bestThr = 0;

    for (let thr = Math.max(step, minThr); thr <= avg + 0.5 * sd; thr += step) {
      const thr2 = step === 0.5 ? Math.round(thr * 2) / 2 : Math.round(thr);
      const hr   = hitRate(vals, thr2);
      if (hr >= 0.70 && thr2 > bestThr) {
        bestHR  = hr;
        bestThr = thr2;
      }
    }

    if (bestThr > 0 && bestHR >= 0.70) {
      picks.push({
        player:        h.name,
        side:          h.side,
        teamAbbr:      h.teamAbbr,
        stat,
        statLabel:     STAT_LABELS[stat],
        direction:     "over",
        threshold:     bestThr,
        hitRate:       bestHR,
        avgStat:       Math.round(avg * 10) / 10,
        gamesAnalyzed: h.games.length,
        confidence:    confidence(bestHR, h.games.length),
      });
    }
  }

  return picks;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeNBAPlayerPicks(params: {
  homeGames:  NBAGamePlayerStats[][];
  awayGames:  NBAGamePlayerStats[][];
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr:   string;
  awayAbbr:   string;
}): NBAPlayerPick[] {
  const { homeGames, awayGames, homeTeamId, awayTeamId, homeAbbr, awayAbbr } = params;

  const homeHistories = buildPlayerHistories(homeGames, homeTeamId, "home", homeAbbr);
  const awayHistories = buildPlayerHistories(awayGames, awayTeamId, "away", awayAbbr);

  const allPicks: NBAPlayerPick[] = [];
  for (const h of [...homeHistories, ...awayHistories]) {
    allPicks.push(...picksForPlayer(h));
  }

  // Deduplicate: keep highest-scoring pick per player per stat
  const bestByKey = new Map<string, NBAPlayerPick>();
  for (const p of allPicks) {
    const key = `${p.player}|${p.stat}`;
    const existing = bestByKey.get(key);
    if (!existing || pickScore(p) > pickScore(existing)) {
      bestByKey.set(key, p);
    }
  }

  return Array.from(bestByKey.values())
    .sort((a, b) => pickScore(b) - pickScore(a))
    .slice(0, 10);
}
