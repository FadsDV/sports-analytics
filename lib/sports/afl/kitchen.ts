/**
 * AFL Kitchen — 6-slip bet slip generator.
 *
 * Slip types:
 *   safe        — composite ≥ 0.75, conservative thresholds, max 5 legs
 *   doable      — composite ≥ 0.58, moderate thresholds, max 5 legs
 *   goalscorers — Goals only, composite ≥ 0.42, max 5 legs
 *   disposals   — Disposals only, composite ≥ 0.55, max 9 legs
 *   ballsy      — composite 0.22–0.55, high thresholds, bounce-back bonus, max 8 legs
 *   value       — single legs, odds > 1.60, top 10 by (reliability × odds)
 *
 * Scoring uses the sport-agnostic reliability engine:
 *   composite = weightedHitRate × consistencyFactor × sampleFactor
 *               + contextualBonus
 * (No minutes factor for AFL — TOG not yet extracted.)
 *
 * Same player max 2× per slip (different stat or threshold).
 * Bounce-back: last game < 65% of average → flagged for ballsy + value.
 * Min games: 5 (players with fewer games are excluded).
 */

import type { AFLGamePlayerStats } from "@/lib/sports/espn";
import type { AFLPickStat } from "./picks";
import { computeReliability, AFL_CONFIG } from "@/lib/sports/reliability/engine";
import type { ReliabilityBreakdown } from "@/lib/sports/reliability/types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type KitchenSlipType =
  | "safe"
  | "doable"
  | "goalscorers"
  | "disposals"
  | "ballsy"
  | "value";

export interface KitchenLeg {
  player:        string;
  side:          "home" | "away";
  teamAbbr:      string;
  stat:          AFLPickStat;
  statLabel:     string;
  threshold:     number;
  /** Flat (unweighted) hit rate — for threshold search context */
  hitRate:       number;
  /** Composite reliability score (0–1). Primary display score. */
  reliability:   number;
  /** Full breakdown for expandable tooltip */
  breakdown:     ReliabilityBreakdown;
  avgStat:       number;
  gamesAnalyzed: number;
  isBounceBack:  boolean;
  prop?:         { price: number; line: number; bookmaker: string };
}

export interface KitchenSlip {
  type: KitchenSlipType;
  legs: KitchenLeg[];
}

// ─── Internal config ──────────────────────────────────────────────────────────

const STAT_LABELS: Record<AFLPickStat, string> = {
  D: "disposals", G: "goals", M: "marks", T: "tackles", HO: "hitouts",
};

const STEP: Record<AFLPickStat, number> = {
  D: 1, G: 0.5, M: 1, T: 1, HO: 2,
};

const MIN_AVG: Record<AFLPickStat, number> = {
  D: 8, G: 0.35, M: 2, T: 2, HO: 3,
};

// ─── Math ─────────────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function calcHitRate(vals: number[], thr: number): number {
  return vals.length ? vals.filter(v => v >= thr).length / vals.length : 0;
}

/**
 * Find the HIGHEST threshold in [avg * minFraction … avg * 1.65] where
 * flat hit rate is within [minHR, maxHR].
 */
function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        AFLPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
): { threshold: number; hitRate: number } | null {
  const step   = STEP[stat];
  const rawMin = avg * minFraction;
  const minThr = stat === "G"
    ? Math.max(step, Math.round(rawMin * 2) / 2)
    : Math.max(step, Math.round(rawMin));

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = minThr; t <= avg * 1.65 + step; t += step) {
    const thr = stat === "G" ? Math.round(t * 2) / 2 : Math.round(t);
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
  stat:          AFLPickStat;
  vals:          number[];
  avg:           number;
  isBounceBack:  boolean;
  gamesAnalyzed: number;
}

function buildProfiles(
  gamesByGame: AFLGamePlayerStats[][],
  teamId:      string,
  side:        "home" | "away",
  teamAbbr:    string,
): Profile[] {
  const playerStats = new Map<string, Record<AFLPickStat, number[]>>();

  for (const game of gamesByGame) {
    for (const p of game) {
      if (p.teamId !== teamId) continue;
      if (!playerStats.has(p.name)) {
        playerStats.set(p.name, { D: [], G: [], M: [], T: [], HO: [] });
      }
      const m = playerStats.get(p.name)!;
      m.D.push(p.D);
      m.G.push(p.G);
      m.M.push(p.M);
      m.T.push(p.T);
      m.HO.push(p.HO);
    }
  }

  const profiles: Profile[] = [];
  const STATS: AFLPickStat[] = ["D", "G", "M", "T", "HO"];

  for (const [name, statMap] of Array.from(playerStats.entries())) {
    for (const stat of STATS) {
      const vals = statMap[stat];
      // Minimum 5 games required
      if (vals.length < 5) continue;
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

interface TierConfig {
  minFlatHR:       number;
  maxFlatHR:       number;
  minFraction:     number;
  minReliability:  number;
  maxReliability:  number;
  maxLegs:         number;
  statsFilter?:    AFLPickStat[];
  bounceBonusWeight: number;
}

function buildLegs(
  profiles: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  tier:     TierConfig,
): KitchenLeg[] {
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
      vals:      p.vals,
      threshold: found.threshold,
      config:    AFL_CONFIG,
    });

    const reliability = tier.bounceBonusWeight > 0 && p.isBounceBack
      ? Math.min(1.0, breakdown.finalReliability + tier.bounceBonusWeight)
      : breakdown.finalReliability;

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

  const legs: KitchenLeg[] = [];
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
      gamesAnalyzed: p.gamesAnalyzed,
      isBounceBack:  p.isBounceBack,
      prop,
    });

    playerCount.set(p.name, used + 1);
  }

  return legs;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeAFLKitchen(params: {
  homeGames:  AFLGamePlayerStats[][];
  awayGames:  AFLGamePlayerStats[][];
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr:   string;
  awayAbbr:   string;
  propOdds:   Map<string, { price: number; line: number; bookmaker: string }>;
}): KitchenSlip[] {
  const { homeGames, awayGames, homeTeamId, awayTeamId, homeAbbr, awayAbbr, propOdds } = params;

  const homeProfiles = buildProfiles(homeGames, homeTeamId, "home", homeAbbr);
  const awayProfiles = buildProfiles(awayGames, awayTeamId, "away", awayAbbr);
  const all = [...homeProfiles, ...awayProfiles];

  // ── 1. Safe — composite ≥ 0.62 ────────────────────────────────────────────
  // flatHR gate lowered to 0.65 so that composite score (not flat HR alone)
  // is the primary filter. Players hitting 65%+ flat but consistently can
  // composite above 0.62 and rightfully belong in Safe.
  const safeLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00, minFraction: 0.50,
    minReliability: 0.62, maxReliability: 1.00,
    maxLegs: 5, bounceBonusWeight: 0,
  });

  // ── 2. Doable — composite ≥ 0.45, moderate thresholds ────────────────────
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00, minFraction: 0.65,
    minReliability: 0.45, maxReliability: 1.00,
    maxLegs: 7, bounceBonusWeight: 0,
  });
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 5);

  // ── 3. Goal Scorers — Goals only, composite ≥ 0.32 ───────────────────────
  const goalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.50, maxFlatHR: 1.00, minFraction: 0.40,
    minReliability: 0.32, maxReliability: 1.00,
    maxLegs: 5, statsFilter: ["G"], bounceBonusWeight: 0,
  });

  // ── 4. Disposals Only — composite ≥ 0.42 ─────────────────────────────────
  const disposalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.55,
    minReliability: 0.42, maxReliability: 1.00,
    maxLegs: 9, statsFilter: ["D"], bounceBonusWeight: 0,
  });

  // ── 5. Ballsy — composite 0.15–0.48, high thresholds, bounce-back bonus ──
  const ballsyLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.35, maxFlatHR: 0.62, minFraction: 0.82,
    minReliability: 0.15, maxReliability: 0.48,
    maxLegs: 8, bounceBonusWeight: 0.08,
  });

  // ── 6. Value Picks — single legs, odds > 1.60, top 10 ───────────────────
  const valueCandidates: Array<{ leg: KitchenLeg; score: number }> = [];
  const valueSeen = new Set<string>();

  for (const p of all) {
    const key = `${p.name}|${p.stat}`;
    if (valueSeen.has(key)) continue;

    const found = findBestThreshold(p.vals, p.avg, p.stat, 0.68, 1.0, 0.58);
    if (!found) continue;

    const prop = propOdds.get(`${p.name}|${p.stat}`);
    if (!prop || prop.price < 1.60) continue;

    const breakdown = computeReliability({
      vals:      p.vals,
      threshold: found.threshold,
      config:    AFL_CONFIG,
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
    { type: "goalscorers", legs: goalLegs },
    { type: "disposals",   legs: disposalLegs },
    { type: "ballsy",      legs: ballsyLegs },
    { type: "value",       legs: valueLegs },
  ];
}
