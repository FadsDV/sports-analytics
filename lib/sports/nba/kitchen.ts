/**
 * NBA Kitchen — 6-slip bet slip generator.
 *
 * Slip types:
 *   safe        — 80%+ hit rate, conservative thresholds, max 5 legs
 *   doable      — 70%+ hit rate, moderate thresholds, max 5 legs
 *   scorers     — PTS only, 55%+, reliable point-getters, max 5 legs
 *   playmakers  — REB + AST legs only, 65%+, max 8 legs
 *   ballsy      — 40–62% hit rate, high thresholds, bounce-back bonus, max 8 legs
 *   value       — single legs, odds > 1.60, top 10 by (hitRate × odds)
 *
 * Same player max 2× per slip (different stat or threshold).
 * Bounce-back: last game < 65% of average → flagged for ballsy + value.
 */

import type { NBAGamePlayerStats } from "@/lib/sports/espn";
import type { NBAPickStat } from "./picks";

// ─── Public types ─────────────────────────────────────────────────────────────

export type NBAKitchenSlipType =
  | "safe"
  | "doable"
  | "scorers"
  | "playmakers"
  | "ballsy"
  | "value";

export interface NBAKitchenLeg {
  player:        string;
  side:          "home" | "away";
  teamAbbr:      string;
  stat:          NBAPickStat;
  statLabel:     string;
  threshold:     number;
  hitRate:       number;
  avgStat:       number;
  gamesAnalyzed: number;
  isBounceBack:  boolean;
  prop?:         { price: number; line: number; bookmaker: string };
}

export interface NBAKitchenSlip {
  type: NBAKitchenSlipType;
  legs: NBAKitchenLeg[];
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

const STEP: Record<NBAPickStat, number> = {
  PTS:  1,
  REB:  1,
  AST:  1,
  FG3M: 0.5,
  STL:  0.5,
  BLK:  0.5,
};

const MIN_AVG: Record<NBAPickStat, number> = {
  PTS:  8,
  REB:  3,
  AST:  2,
  FG3M: 0.8,
  STL:  0.3,
  BLK:  0.3,
};

// ─── Math ─────────────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function calcHitRate(vals: number[], thr: number): number {
  return vals.length ? vals.filter(v => v >= thr).length / vals.length : 0;
}

function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        NBAPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
): { threshold: number; hitRate: number } | null {
  const step    = STEP[stat];
  const rawMin  = avg * minFraction;
  const isHalf  = step === 0.5;
  const minThr  = isHalf
    ? Math.max(step, Math.round(rawMin * 2) / 2)
    : Math.max(step, Math.round(rawMin));

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = minThr; t <= avg * 1.65 + step; t += step) {
    const thr = isHalf ? Math.round(t * 2) / 2 : Math.round(t);
    const hr  = calcHitRate(vals, thr);
    if (hr >= minHR && hr <= maxHR) {
      if (!best || thr > best.threshold) {
        best = { threshold: thr, hitRate: hr };
      }
    }
  }
  return best;
}

// ─── Player profile builder ───────────────────────────────────────────────────

interface Profile {
  name:          string;
  side:          "home" | "away";
  teamAbbr:      string;
  stat:          NBAPickStat;
  vals:          number[];
  avg:           number;
  isBounceBack:  boolean;
  gamesAnalyzed: number;
}

function buildProfiles(
  gamesByGame: NBAGamePlayerStats[][],
  teamId:      string,
  side:        "home" | "away",
  teamAbbr:    string,
): Profile[] {
  const playerStats = new Map<string, Record<NBAPickStat, number[]>>();

  for (const game of gamesByGame) {
    for (const p of game) {
      if (p.teamId !== teamId) continue;
      if (!playerStats.has(p.name)) {
        playerStats.set(p.name, { PTS: [], REB: [], AST: [], FG3M: [], STL: [], BLK: [] });
      }
      const m = playerStats.get(p.name)!;
      m.PTS.push(p.PTS);
      m.REB.push(p.REB);
      m.AST.push(p.AST);
      m.FG3M.push(p.FG3M);
      m.STL.push(p.STL);
      m.BLK.push(p.BLK);
    }
  }

  const profiles: Profile[] = [];
  const STATS: NBAPickStat[] = ["PTS", "REB", "AST", "FG3M", "STL", "BLK"];

  for (const [name, statMap] of Array.from(playerStats.entries())) {
    for (const stat of STATS) {
      const vals = statMap[stat];
      if (vals.length < 3) continue;
      const avg = mean(vals);
      if (avg < MIN_AVG[stat]) continue;

      const lastGame     = vals[vals.length - 1] ?? 0;
      const isBounceBack = lastGame < avg * 0.65 && avg >= MIN_AVG[stat] * 1.5;

      profiles.push({
        name, side, teamAbbr, stat, vals, avg,
        isBounceBack, gamesAnalyzed: vals.length,
      });
    }
  }

  return profiles;
}

// ─── Leg assembler ────────────────────────────────────────────────────────────

function buildLegs(
  profiles:          Profile[],
  propOdds:          Map<string, { price: number; line: number; bookmaker: string }>,
  minHR:             number,
  maxHR:             number,
  minFraction:       number,
  maxLegs:           number,
  statsFilter?:      NBAPickStat[],
  bounceBonusWeight: number = 0,
): NBAKitchenLeg[] {
  type Candidate = {
    profile:   Profile;
    threshold: number;
    hitRate:   number;
    score:     number;
  };

  const candidates: Candidate[] = [];

  for (const p of profiles) {
    if (statsFilter && !statsFilter.includes(p.stat)) continue;
    const found = findBestThreshold(p.vals, p.avg, p.stat, minHR, maxHR, minFraction);
    if (!found) continue;

    let score = found.hitRate * Math.min(p.gamesAnalyzed / 5, 1);
    if (p.isBounceBack) score += bounceBonusWeight;

    candidates.push({ profile: p, threshold: found.threshold, hitRate: found.hitRate, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const legs: NBAKitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const { profile: p, threshold, hitRate } of candidates) {
    if (legs.length >= maxLegs) break;
    const used = playerCount.get(p.name) ?? 0;
    if (used >= 2) continue;

    const prop = propOdds.get(`${p.name}|${p.stat}`);

    legs.push({
      player:        p.name,
      side:          p.side,
      teamAbbr:      p.teamAbbr,
      stat:          p.stat,
      statLabel:     STAT_LABELS[p.stat],
      threshold,
      hitRate,
      avgStat:       Math.round(p.avg * 10) / 10,
      gamesAnalyzed: p.gamesAnalyzed,
      isBounceBack:  p.isBounceBack,
      prop,
    });

    playerCount.set(p.name, used + 1);
  }

  return legs;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeNBAKitchen(params: {
  homeGames:  NBAGamePlayerStats[][];
  awayGames:  NBAGamePlayerStats[][];
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr:   string;
  awayAbbr:   string;
  propOdds:   Map<string, { price: number; line: number; bookmaker: string }>;
}): NBAKitchenSlip[] {
  const { homeGames, awayGames, homeTeamId, awayTeamId, homeAbbr, awayAbbr, propOdds } = params;

  const homeProfiles = buildProfiles(homeGames, homeTeamId, "home", homeAbbr);
  const awayProfiles = buildProfiles(awayGames, awayTeamId, "away", awayAbbr);
  const all = [...homeProfiles, ...awayProfiles];

  // ── 1. Safe — 80%+ hit rate, conservative thresholds ─────────────────────
  const safeLegs = buildLegs(all, propOdds, 0.80, 1.0, 0.50, 5);

  // ── 2. Doable — 70%+ hit rate, higher floor so thresholds are harder ──────
  const doableRaw  = buildLegs(all, propOdds, 0.70, 1.0, 0.65, 7);
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 5);

  // ── 3. Scorers — PTS only, 55%+, max 5 ───────────────────────────────────
  const scorerLegs = buildLegs(
    all.filter(p => p.stat === "PTS"),
    propOdds, 0.55, 1.0, 0.40, 5, ["PTS"],
  );

  // ── 4. Playmakers — REB + AST only, 65%+, max 8 legs ─────────────────────
  const playmakerLegs = buildLegs(
    all, propOdds, 0.65, 1.0, 0.55, 8, ["REB", "AST"],
  );

  // ── 5. Ballsy — 40–62% hit rate, high thresholds, bounce-back bonus ───────
  const ballsyLegs = buildLegs(
    all, propOdds, 0.40, 0.64, 0.82, 8,
    undefined, 0.15,
  );

  // ── 6. Value Picks — single legs, odds > 1.60, top 10 ────────────────────
  const valueCandidates: Array<{ leg: NBAKitchenLeg; score: number }> = [];
  const valueSeen = new Set<string>();

  for (const p of all) {
    const key = `${p.name}|${p.stat}`;
    if (valueSeen.has(key)) continue;

    const found = findBestThreshold(p.vals, p.avg, p.stat, 0.68, 1.0, 0.58);
    if (!found) continue;

    const prop = propOdds.get(`${p.name}|${p.stat}`);
    if (!prop || prop.price < 1.60) continue;

    valueSeen.add(key);
    const score = found.hitRate * Math.min(p.gamesAnalyzed / 5, 1) * prop.price;

    valueCandidates.push({
      leg: {
        player:        p.name,
        side:          p.side,
        teamAbbr:      p.teamAbbr,
        stat:          p.stat,
        statLabel:     STAT_LABELS[p.stat],
        threshold:     found.threshold,
        hitRate:       found.hitRate,
        avgStat:       Math.round(p.avg * 10) / 10,
        gamesAnalyzed: p.gamesAnalyzed,
        isBounceBack:  p.isBounceBack,
        prop,
      },
      score,
    });
  }

  valueCandidates.sort((a, b) => b.score - a.score);
  const valueLegs = valueCandidates.slice(0, 10).map(c => c.leg);

  return [
    { type: "safe",        legs: safeLegs },
    { type: "doable",      legs: doableLegs },
    { type: "scorers",     legs: scorerLegs },
    { type: "playmakers",  legs: playmakerLegs },
    { type: "ballsy",      legs: ballsyLegs },
    { type: "value",       legs: valueLegs },
  ];
}
