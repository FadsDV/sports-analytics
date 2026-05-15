/**
 * NBA Kitchen — 6-slip bet slip generator.
 *
 * Slip types:
 *   safe        — composite ≥ 0.70, conservative thresholds, max 5 legs
 *   doable      — composite ≥ 0.50, moderate thresholds, max 5 legs
 *   scorers     — PTS only, composite ≥ 0.42, max 5 legs
 *   playmakers  — REB + AST legs only, composite ≥ 0.50, max 8 legs
 *   ballsy      — composite 0.20–0.55, high thresholds, bounce-back bonus, max 8 legs
 *   value       — single legs, odds > 1.60, top 10 by (reliability × odds)
 *
 * Scoring uses the sport-agnostic reliability engine:
 *   composite = weightedHitRate × consistencyFactor × sampleFactor × minutesFactor
 *               + contextualBonus
 *
 * Same player max 2× per slip (different stat or threshold).
 * Bounce-back: last game < 65% of average → flagged for ballsy + value.
 * Min games: 5 (players with fewer games are excluded).
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
  /** Flat (unweighted) hit rate — for threshold search display context */
  hitRate:       number;
  /** Composite reliability score (0–1). This is the primary display score. */
  reliability:   number;
  /** Full breakdown for expandable tooltip */
  breakdown:     ReliabilityBreakdown;
  avgStat:       number;
  avgMinutes:    number;
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

/**
 * Find the highest threshold in [avg×minFraction, avg×1.65] where flat hit rate
 * falls within [minHR, maxHR].
 */
function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        NBAPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
): { threshold: number; hitRate: number } | null {
  const step   = STEP[stat];
  const rawMin = avg * minFraction;
  const isHalf = step === 0.5;
  const minThr = isHalf
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
  avgMinutes:    number;
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
      // Minimum 5 games required (engine enforces this, but pre-filter here too)
      if (vals.length < 5) continue;
      const avg = mean(vals);
      if (avg < MIN_AVG[stat]) continue;

      const lastGame     = vals[vals.length - 1] ?? 0;
      const isBounceBack = lastGame < avg * 0.65 && avg >= MIN_AVG[stat] * 1.5;

      profiles.push({
        name, side, teamAbbr, stat, vals, avg,
        avgMinutes, isBounceBack, gamesAnalyzed: vals.length,
      });
    }
  }

  return profiles;
}

// ─── Leg assembler ────────────────────────────────────────────────────────────

interface TierConfig {
  /** Flat hit rate range for threshold search */
  minFlatHR:    number;
  maxFlatHR:    number;
  /** Min fraction of avg for threshold floor */
  minFraction:  number;
  /** Min composite reliability to include in slip */
  minReliability: number;
  /** Max composite reliability (use 1.0 for no upper cap) */
  maxReliability: number;
  maxLegs:        number;
  statsFilter?:   NBAPickStat[];
  bounceBonusWeight: number;
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

    const found = findBestThreshold(p.vals, p.avg, p.stat, tier.minFlatHR, tier.maxFlatHR, tier.minFraction);
    if (!found) continue;

    const breakdown = computeReliability({
      vals:        p.vals,
      threshold:   found.threshold,
      avgMinutes:  p.avgMinutes,
      config:      NBA_CONFIG,
    });

    // Apply bounce-back contextual bonus
    const reliability = tier.bounceBonusWeight > 0 && p.isBounceBack
      ? Math.min(1.0, breakdown.finalReliability + tier.bounceBonusWeight)
      : breakdown.finalReliability;

    // Filter by composite reliability range
    if (reliability < tier.minReliability || reliability > tier.maxReliability) continue;

    candidates.push({
      profile:     p,
      threshold:   found.threshold,
      flatHitRate: found.hitRate,
      reliability,
      breakdown:   { ...breakdown, finalReliability: reliability },
    });
  }

  // Sort by composite reliability descending
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

  // ── 1. Safe — composite ≥ 0.55 ───────────────────────────────────────────
  // Note: NBA minutes factor reduces composite further vs AFL. At 5 games +
  // 28MPG, max composite ≈ 0.63. Threshold calibrated for production data.
  const safeLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.75, maxFlatHR: 1.00, minFraction: 0.50,
    minReliability: 0.55, maxReliability: 1.00,
    maxLegs: 5, bounceBonusWeight: 0,
  });

  // ── 2. Doable — composite ≥ 0.38, broader threshold range ───────────────
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00, minFraction: 0.65,
    minReliability: 0.38, maxReliability: 1.00,
    maxLegs: 7, bounceBonusWeight: 0,
  });
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 5);

  // ── 3. Scorers — PTS only, composite ≥ 0.30 ─────────────────────────────
  const scorerLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.55, maxFlatHR: 1.00, minFraction: 0.40,
    minReliability: 0.30, maxReliability: 1.00,
    maxLegs: 5, statsFilter: ["PTS"], bounceBonusWeight: 0,
  });

  // ── 4. Playmakers — REB + AST only, composite ≥ 0.38 ────────────────────
  const playmakerLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.55,
    minReliability: 0.38, maxReliability: 1.00,
    maxLegs: 8, statsFilter: ["REB", "AST"], bounceBonusWeight: 0,
  });

  // ── 5. Ballsy — composite 0.12–0.42, high thresholds, bounce-back bonus ──
  const ballsyLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.35, maxFlatHR: 0.62, minFraction: 0.82,
    minReliability: 0.12, maxReliability: 0.42,
    maxLegs: 8, bounceBonusWeight: 0.08,
  });

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

    if (breakdown.finalReliability === 0) continue; // ineligible

    valueSeen.add(key);
    // Value score = reliability × odds (not just flat hit rate)
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
