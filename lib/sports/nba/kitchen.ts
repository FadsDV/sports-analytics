/**
 * NBA Kitchen — 6-slip bet slip generator.
 *
 * Slip architecture (redesigned):
 *
 *   safe        — top 3 legs by composite, each ≥ 5.5/10. Combined ~17–30%.
 *   doable      — next 3 legs, each ≥ 3.8/10. Mixed reliable + slightly harder.
 *   scorers     — PTS only, max 4 legs, each ≥ 3.0/10.
 *   playmakers  — REB + AST only, max 4 legs, each ≥ 3.8/10.
 *   ballsy      — max 3 legs. On-form players (last 3g > avg × 1.10) pushed to
 *                 higher thresholds. Regular bold picks as fallback.
 *   value       — single legs, odds > 1.60, top 10 by (reliability × odds).
 *
 * Fewer legs = honest combined probability.
 * Same player max 2× per slip (different stat or threshold).
 * Min games: 5.
 */

import type { NBAGamePlayerStats } from "@/lib/sports/espn";
import type { NBAPickStat } from "./picks";
import { computeReliability, NBA_CONFIG } from "@/lib/sports/reliability/engine";
import type { ReliabilityBreakdown } from "@/lib/sports/reliability/types";

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
  reliability:   number;
  breakdown:     ReliabilityBreakdown;
  avgStat:       number;
  avgMinutes:    number;
  gamesAnalyzed: number;
  isBounceBack:  boolean;
  /** Player's last 3 games are trending above their season average */
  isOnForm:      boolean;
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
  maxFraction: number = 1.8,
): { threshold: number; hitRate: number } | null {
  const step   = STEP[stat];
  const rawMin = avg * minFraction;
  const isHalf = step === 0.5;
  const minThr = isHalf
    ? Math.max(step, Math.round(rawMin * 2) / 2)
    : Math.max(step, Math.round(rawMin));

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = minThr; t <= avg * maxFraction + step; t += step) {
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
  avgMinutes:    number;
  recentAvg:     number;
  isOnForm:      boolean;
  isBounceBack:  boolean;
  gamesAnalyzed: number;
}

function buildProfiles(
  gamesByGame: NBAGamePlayerStats[][],
  teamId:      string,
  side:        "home" | "away",
  teamAbbr:    string,
): Profile[] {
  const playerStats = new Map<string, Record<NBAPickStat, number[]> & { MIN: number[] }>();

  for (const game of gamesByGame) {
    for (const p of game) {
      if (p.teamId !== teamId) continue;
      if (!playerStats.has(p.name)) {
        playerStats.set(p.name, { PTS: [], REB: [], AST: [], FG3M: [], STL: [], BLK: [], MIN: [] });
      }
      const m = playerStats.get(p.name)!;
      m.PTS.push(p.PTS);
      m.REB.push(p.REB);
      m.AST.push(p.AST);
      m.FG3M.push(p.FG3M);
      m.STL.push(p.STL);
      m.BLK.push(p.BLK);
      if (p.MIN > 0) m.MIN.push(p.MIN);
    }
  }

  const profiles: Profile[] = [];
  const STATS: NBAPickStat[] = ["PTS", "REB", "AST", "FG3M", "STL", "BLK"];

  for (const [name, statMap] of Array.from(playerStats.entries())) {
    const avgMinutes = statMap.MIN.length > 0 ? mean(statMap.MIN) : 0;

    for (const stat of STATS) {
      const vals = statMap[stat];
      if (vals.length < 5) continue;
      const avg = mean(vals);
      if (avg < MIN_AVG[stat]) continue;

      const recent3      = vals.slice(-3);
      const recentAvg    = mean(recent3);
      const isOnForm     = recent3.length >= 3 && recentAvg >= avg * 1.10;
      const lastGame     = vals[vals.length - 1] ?? 0;
      const isBounceBack = lastGame < avg * 0.65 && avg >= MIN_AVG[stat] * 1.5;

      profiles.push({
        name, side, teamAbbr, stat, vals, avg,
        avgMinutes, recentAvg, isOnForm, isBounceBack, gamesAnalyzed: vals.length,
      });
    }
  }

  return profiles;
}

// ─── Leg assembler ────────────────────────────────────────────────────────────

interface TierConfig {
  minFlatHR:       number;
  maxFlatHR:       number;
  minFraction:     number;
  maxFraction?:    number;
  minReliability:  number;
  maxReliability:  number;
  maxLegs:         number;
  statsFilter?:    NBAPickStat[];
  formBonus:       number;
}

function buildLegs(
  profiles: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  tier:     TierConfig,
): NBAKitchenLeg[] {
  type Candidate = {
    profile:     Profile;
    threshold:   number;
    flatHitRate: number;
    reliability: number;
    breakdown:   ReliabilityBreakdown;
  };

  const candidates: Candidate[] = [];

  for (const p of profiles) {
    if (tier.statsFilter && !tier.statsFilter.includes(p.stat)) continue;

    const found = findBestThreshold(
      p.vals, p.avg, p.stat,
      tier.minFlatHR, tier.maxFlatHR,
      tier.minFraction, tier.maxFraction,
    );
    if (!found) continue;

    const breakdown = computeReliability({
      vals:        p.vals,
      threshold:   found.threshold,
      avgMinutes:  p.avgMinutes,
      config:      NBA_CONFIG,
    });

    let reliability = breakdown.finalReliability;
    if (tier.formBonus > 0 && p.isOnForm) reliability = Math.min(1.0, reliability + tier.formBonus);

    if (reliability < tier.minReliability || reliability > tier.maxReliability) continue;

    candidates.push({
      profile:     p,
      threshold:   found.threshold,
      flatHitRate: found.hitRate,
      reliability,
      breakdown:   { ...breakdown, finalReliability: reliability },
    });
  }

  candidates.sort((a, b) => b.reliability - a.reliability);

  const legs: NBAKitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const { profile: p, threshold, flatHitRate, reliability, breakdown } of candidates) {
    if (legs.length >= tier.maxLegs) break;
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
      hitRate:       flatHitRate,
      reliability,
      breakdown,
      avgStat:       Math.round(p.avg * 10) / 10,
      avgMinutes:    Math.round(p.avgMinutes * 10) / 10,
      gamesAnalyzed: p.gamesAnalyzed,
      isBounceBack:  p.isBounceBack,
      isOnForm:      p.isOnForm,
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

  // ── 1. Safe — top 3 by composite, each ≥ 5.5/10 ─────────────────────────
  const safeLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00, minFraction: 0.50,
    minReliability: 0.55, maxReliability: 1.00,
    maxLegs: 3, formBonus: 0,
  });

  // ── 2. Doable — next 3 legs, each 3.8–8.0/10 ─────────────────────────────
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.60,
    minReliability: 0.38, maxReliability: 1.00,
    maxLegs: 5, formBonus: 0,
  });
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 3);

  // ── 3. Scorers — PTS only, max 4, each ≥ 3.0/10 ─────────────────────────
  const scorerLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.55, maxFlatHR: 1.00, minFraction: 0.40,
    minReliability: 0.30, maxReliability: 1.00,
    maxLegs: 4, statsFilter: ["PTS"], formBonus: 0,
  });

  // ── 4. Playmakers — REB + AST only, max 4, each ≥ 3.8/10 ────────────────
  const playmakerLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.55,
    minReliability: 0.38, maxReliability: 1.00,
    maxLegs: 4, statsFilter: ["REB", "AST"], formBonus: 0,
  });

  // ── 5. Ballsy — max 3 legs ────────────────────────────────────────────────
  // Pass A: on-form players (last 3g ≥ avg × 1.10) pushed to higher threshold.
  // Pass B: regular bold picks fallback.
  const onFormProfiles = all.filter(p => p.isOnForm);
  const ballsyOnForm   = buildLegs(onFormProfiles, propOdds, {
    minFlatHR: 0.30, maxFlatHR: 0.65, minFraction: 1.00, maxFraction: 2.0,
    minReliability: 0.12, maxReliability: 0.58,
    maxLegs: 5, formBonus: 0.05,
  });

  const ballsyRegular = buildLegs(all, propOdds, {
    minFlatHR: 0.35, maxFlatHR: 0.62, minFraction: 0.85, maxFraction: 1.8,
    minReliability: 0.12, maxReliability: 0.55,
    maxLegs: 5, formBonus: 0,
  });

  const ballsySeen   = new Set<string>();
  const ballsyMerged: NBAKitchenLeg[] = [];
  for (const leg of [...ballsyOnForm, ...ballsyRegular]) {
    const key = `${leg.player}|${leg.stat}|${leg.threshold}`;
    if (ballsySeen.has(key)) continue;
    ballsySeen.add(key);
    ballsyMerged.push(leg);
    if (ballsyMerged.length >= 3) break;
  }
  const ballsyLegs = ballsyMerged;

  // ── 6. Value Picks — single legs, odds > 1.60, top 10 ───────────────────
  const valueCandidates: Array<{ leg: NBAKitchenLeg; score: number }> = [];
  const valueSeen = new Set<string>();

  for (const p of all) {
    const key = `${p.name}|${p.stat}`;
    if (valueSeen.has(key)) continue;

    const found = findBestThreshold(p.vals, p.avg, p.stat, 0.68, 1.0, 0.58);
    if (!found) continue;

    const prop = propOdds.get(`${p.name}|${p.stat}`);
    if (!prop || prop.price < 1.60) continue;

    const breakdown = computeReliability({
      vals:        p.vals,
      threshold:   found.threshold,
      avgMinutes:  p.avgMinutes,
      config:      NBA_CONFIG,
    });

    if (breakdown.finalReliability === 0) continue;

    valueSeen.add(key);
    const score = breakdown.finalReliability * prop.price;

    valueCandidates.push({
      leg: {
        player:        p.name,
        side:          p.side,
        teamAbbr:      p.teamAbbr,
        stat:          p.stat,
        statLabel:     STAT_LABELS[p.stat],
        threshold:     found.threshold,
        hitRate:       found.hitRate,
        reliability:   breakdown.finalReliability,
        breakdown,
        avgStat:       Math.round(p.avg * 10) / 10,
        avgMinutes:    Math.round(p.avgMinutes * 10) / 10,
        gamesAnalyzed: p.gamesAnalyzed,
        isBounceBack:  p.isBounceBack,
        isOnForm:      p.isOnForm,
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
