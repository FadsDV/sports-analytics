/**
 * AFL Kitchen — 6-slip bet slip generator.
 *
 * Slip architecture:
 *
 *   safe        — top 3 legs. Threshold set well below average (≤75% of avg).
 *                 Each leg hits 80%+ of games. Goal: near-certain combined bet.
 *
 *   doable      — next 3 legs. Threshold ~80-90% of avg. Hit rate 68-80%.
 *                 Reliable but slightly harder than Safe.
 *
 *   goalscorers — goals only, max 4 legs. Same comfortable-below-avg approach.
 *
 *   disposals   — disposals only, max 5 legs. Same approach.
 *
 *   ballsy      — max 3 legs. On-form players (last 3g ≥ avg × 1.10) pushed
 *                 ABOVE recent form (threshold > recentAvg). Regular bold picks
 *                 at/above season avg as fallback.
 *
 *   value       — bookmaker line is BELOW player average. Hit rate at the actual
 *                 book line, not a computed threshold. Odds > 1.60.
 *                 Sorted by edge (avg − line) × odds.
 *
 * Same player max 2× per slip (different stat). Min 5 games.
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
  hitRate:       number;
  reliability:   number;
  breakdown:     ReliabilityBreakdown;
  avgStat:       number;
  gamesAnalyzed: number;
  isBounceBack:  boolean;
  /** Player's last 3 games are trending above their season average */
  isOnForm:      boolean;
  prop?:         { price: number; line: number; bookmaker: string };
  /** Value only: how far the book line sits below the player's average */
  edge?:         number;
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
 * Find the HIGHEST threshold within [minFraction×avg, maxFraction×avg] that
 * still achieves a hit rate between minHR and maxHR.
 * "Highest threshold that still passes" = hardest beatable line in the zone.
 */
function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        AFLPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
  maxFraction: number,
): { threshold: number; hitRate: number } | null {
  const step   = STEP[stat];
  const rawMin = avg * minFraction;
  const rawMax = avg * maxFraction;
  const minThr = stat === "G"
    ? Math.max(step, Math.round(rawMin * 2) / 2)
    : Math.max(step, Math.round(rawMin));
  const maxThr = stat === "G"
    ? Math.round(rawMax * 2) / 2
    : Math.round(rawMax);

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = minThr; t <= maxThr + step; t += step) {
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
  recentAvg:     number;   // avg of last 3 games
  isOnForm:      boolean;  // last 3g avg ≥ season avg × 1.10
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
        recentAvg, isOnForm, isBounceBack, gamesAnalyzed: vals.length,
      });
    }
  }

  return profiles;
}

// ─── Leg assembler (threshold-based slips) ────────────────────────────────────

interface TierConfig {
  minFlatHR:      number;
  maxFlatHR:      number;
  minFraction:    number;   // threshold lower bound as fraction of avg
  maxFraction:    number;   // threshold upper bound as fraction of avg
  minReliability: number;
  maxReliability: number;
  maxLegs:        number;
  statsFilter?:   AFLPickStat[];
  formBonus:      number;
  /** If true, use recentAvg instead of avg as the base for fractions */
  useRecentBase?: boolean;
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

    const base = tier.useRecentBase && p.recentAvg > 0 ? p.recentAvg : p.avg;

    const found = findBestThreshold(
      p.vals, base, p.stat,
      tier.minFlatHR, tier.maxFlatHR,
      tier.minFraction, tier.maxFraction,
    );
    if (!found) continue;

    const breakdown = computeReliability({
      vals:      p.vals,
      threshold: found.threshold,
      config:    AFL_CONFIG,
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
      isOnForm:      p.isOnForm,
      prop,
    });

    playerCount.set(p.name, used + 1);
  }

  return legs;
}

// ─── Value picks (book line vs player average) ────────────────────────────────

function buildValueLegs(
  profiles: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
): KitchenLeg[] {
  type ValueCandidate = { leg: KitchenLeg; score: number };
  const candidates: ValueCandidate[] = [];
  const seen = new Set<string>();

  for (const p of profiles) {
    const key  = `${p.name}|${p.stat}`;
    if (seen.has(key)) continue;

    const prop = propOdds.get(key);

    if (prop && prop.price >= 1.60 && prop.line < p.avg) {
      // ── Live prop: use real bookmaker line ──────────────────────────────
      const hitRate = calcHitRate(p.vals, prop.line);
      if (hitRate < 0.65) continue;

      const breakdown = computeReliability({ vals: p.vals, threshold: prop.line, config: AFL_CONFIG });
      if (breakdown.finalReliability === 0) continue;

      seen.add(key);
      const edge  = p.avg - prop.line;
      const score = (edge / p.avg) * prop.price * breakdown.finalReliability;

      candidates.push({
        score,
        leg: {
          player: p.name, side: p.side, teamAbbr: p.teamAbbr,
          stat: p.stat, statLabel: STAT_LABELS[p.stat],
          threshold: prop.line, hitRate,
          reliability: breakdown.finalReliability, breakdown,
          avgStat: Math.round(p.avg * 10) / 10,
          gamesAnalyzed: p.gamesAnalyzed,
          isBounceBack: p.isBounceBack, isOnForm: p.isOnForm,
          prop,
          edge: Math.round(edge * 10) / 10,
        },
      });
    } else if (!prop) {
      // ── Odds suspended (game live/finished): derive natural line from stats ─
      // Book lines typically sit at 65–82% of a player's average.
      // Find the highest threshold in that zone that still hits 65%+ of games.
      const found = findBestThreshold(p.vals, p.avg, p.stat, 0.65, 0.85, 0.65, 0.82);
      if (!found) continue;
      if (found.hitRate < 0.65) continue;

      const edge = p.avg - found.threshold;
      if (edge <= 0) continue;

      const breakdown = computeReliability({ vals: p.vals, threshold: found.threshold, config: AFL_CONFIG });
      if (breakdown.finalReliability === 0) continue;

      seen.add(key);
      // Score without odds — use reliability × edge fraction
      const score = (edge / p.avg) * breakdown.finalReliability;

      candidates.push({
        score,
        leg: {
          player: p.name, side: p.side, teamAbbr: p.teamAbbr,
          stat: p.stat, statLabel: STAT_LABELS[p.stat],
          threshold: found.threshold, hitRate: found.hitRate,
          reliability: breakdown.finalReliability, breakdown,
          avgStat: Math.round(p.avg * 10) / 10,
          gamesAnalyzed: p.gamesAnalyzed,
          isBounceBack: p.isBounceBack, isOnForm: p.isOnForm,
          // No prop — odds suspended
          edge: Math.round(edge * 10) / 10,
        },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 10).map(c => c.leg);
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

  // ── 1. Safe ───────────────────────────────────────────────────────────────
  // Threshold set well below avg (50–75%). Must hit 80%+ of games.
  // Each leg should be near-certain. Goal: ~2 odds combined across 3 legs.
  const safeLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.80, maxFlatHR: 1.00,
    minFraction: 0.50, maxFraction: 0.75,
    minReliability: 0.60, maxReliability: 1.00,
    maxLegs: 3, formBonus: 0,
  });

  // ── 2. Doable ─────────────────────────────────────────────────────────────
  // Threshold 75–90% of avg. Hit rate 68–80%. Reliable but a step harder.
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.68, maxFlatHR: 1.00,
    minFraction: 0.75, maxFraction: 0.92,
    minReliability: 0.45, maxReliability: 1.00,
    maxLegs: 5, formBonus: 0,
  });
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 3);

  // ── 3. Goal Scorers ───────────────────────────────────────────────────────
  // Goals only. Same comfortable-below-avg approach.
  const goalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00,
    minFraction: 0.40, maxFraction: 0.80,
    minReliability: 0.32, maxReliability: 1.00,
    maxLegs: 4, statsFilter: ["G"], formBonus: 0,
  });

  // ── 4. Disposals ──────────────────────────────────────────────────────────
  // Disposals only. Below-avg threshold, high hit rate.
  const disposalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.72, maxFlatHR: 1.00,
    minFraction: 0.55, maxFraction: 0.85,
    minReliability: 0.42, maxReliability: 1.00,
    maxLegs: 5, statsFilter: ["D"], formBonus: 0,
  });

  // ── 5. Ballsy ─────────────────────────────────────────────────────────────
  // Pass A: on-form players (last 3g ≥ avg × 1.10).
  //   Threshold starts ABOVE recent avg (110% of recentAvg).
  //   e.g. averaging 18 in last 3 → suggest 20+.
  // Pass B: regular bold picks — threshold at/above season avg.
  const onFormProfiles = all.filter(p => p.isOnForm);
  const ballsyOnForm   = buildLegs(onFormProfiles, propOdds, {
    minFlatHR: 0.25, maxFlatHR: 0.60,
    minFraction: 1.10, maxFraction: 1.60,
    minReliability: 0.10, maxReliability: 0.55,
    maxLegs: 5, formBonus: 0.05, useRecentBase: true,
  });

  const ballsyRegular = buildLegs(all, propOdds, {
    minFlatHR: 0.30, maxFlatHR: 0.60,
    minFraction: 0.95, maxFraction: 1.50,
    minReliability: 0.10, maxReliability: 0.52,
    maxLegs: 5, formBonus: 0,
  });

  // Merge: on-form first (priority), fill with regular, max 3
  const ballsySeen    = new Set<string>();
  const ballsyMerged: KitchenLeg[] = [];
  for (const leg of [...ballsyOnForm, ...ballsyRegular]) {
    const key = `${leg.player}|${leg.stat}|${leg.threshold}`;
    if (ballsySeen.has(key)) continue;
    ballsySeen.add(key);
    ballsyMerged.push(leg);
    if (ballsyMerged.length >= 3) break;
  }

  // ── 6. Value Picks ────────────────────────────────────────────────────────
  // Book line < player average. Evaluates hit rate at the actual book line.
  // Sorted by (edge / avg) × odds × reliability.
  const valueLegs = buildValueLegs(all, propOdds);

  return [
    { type: "safe",        legs: safeLegs },
    { type: "doable",      legs: doableLegs },
    { type: "goalscorers", legs: goalLegs },
    { type: "disposals",   legs: disposalLegs },
    { type: "ballsy",      legs: ballsyMerged },
    { type: "value",       legs: valueLegs },
  ];
}

// ─── Bookie-specific kitchen ──────────────────────────────────────────────────

import { snapThreshold, goalLabel, type BookieConfig } from "./bookies";

/**
 * Filter and snap a set of generic kitchen slips to a specific bookie's
 * available markets and valid line increments.
 *
 * - Removes legs for stats not offered by the bookie
 * - Snaps each threshold to the nearest valid bookie line (floors down by default)
 * - Drops legs where no valid line exists (e.g. Dabble: 12 disposals < 15 minimum)
 * - Deduplicates: if two legs snap to the same player+stat+line, keep highest reliability
 */
export function filterSlipsForBookie(
  slips:  KitchenSlip[],
  bookie: BookieConfig,
): KitchenSlip[] {
  return slips.map(slip => {
    const seen = new Map<string, KitchenLeg>();

    for (const leg of slip.legs) {
      const statConfig = bookie.stats[leg.stat];
      if (!statConfig?.available) continue;

      const snapped = snapThreshold(leg.threshold, leg.stat, bookie);
      if (snapped === null) continue;

      const dedupKey = `${leg.player}|${leg.stat}|${snapped}`;
      const existing = seen.get(dedupKey);
      if (!existing || leg.reliability > existing.reliability) {
        // For goals: update statLabel to show bookie-friendly label (e.g. "Anytime")
        const statLabel = leg.stat === "G"
          ? goalLabel(snapped)
          : leg.statLabel;

        seen.set(dedupKey, {
          ...leg,
          threshold: snapped,
          statLabel,
        });
      }
    }

    return { ...slip, legs: Array.from(seen.values()) };
  }).filter(slip => slip.legs.length > 0);
}
