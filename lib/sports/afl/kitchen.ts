/**
 * AFL Kitchen — 6-slip bet slip generator.
 *
 * Slip architecture (redesigned):
 *
 *   safe        — top 3 legs by composite, each ≥ 6.8/10. Combined ~30-50%.
 *   doable      — next 3 legs, each ≥ 5.5/10. Mixed reliable + slightly harder.
 *   goalscorers — goals only, max 4 legs, each ≥ 3.2/10.
 *   disposals   — disposals only, max 5 legs, each ≥ 4.2/10.
 *   ballsy      — max 3 legs. On-form players (last 3g > avg × 1.10) pushed to
 *                 higher thresholds. Regular bold picks as fallback.
 *   value       — single legs, odds > 1.60, top 10 by (reliability × odds).
 *
 * Fewer legs per slip = honest combined probability.
 * Same player max 2× per slip (different stat or threshold).
 * Min games: 5.
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

function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        AFLPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
  maxFraction: number = 1.8,
): { threshold: number; hitRate: number } | null {
  const step   = STEP[stat];
  const rawMin = avg * minFraction;
  const minThr = stat === "G"
    ? Math.max(step, Math.round(rawMin * 2) / 2)
    : Math.max(step, Math.round(rawMin));

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = minThr; t <= avg * maxFraction + step; t += step) {
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

// ─── Leg assembler ────────────────────────────────────────────────────────────

interface TierConfig {
  minFlatHR:       number;
  maxFlatHR:       number;
  minFraction:     number;
  maxFraction?:    number;
  minReliability:  number;
  maxReliability:  number;
  maxLegs:         number;
  statsFilter?:    AFLPickStat[];
  formBonus:       number;
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

    const found = findBestThreshold(
      p.vals, p.avg, p.stat,
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

  // ── 1. Safe — top 3 by composite, each ≥ 6.8/10 ─────────────────────────
  // Max 3 legs so combined stays ~30–50% (honest "safe" parlay).
  const safeLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.65, maxFlatHR: 1.00, minFraction: 0.50,
    minReliability: 0.68, maxReliability: 1.00,
    maxLegs: 3, formBonus: 0,
  });

  // ── 2. Doable — next 3 legs, each 5.5–8.0/10 ─────────────────────────────
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.60,
    minReliability: 0.55, maxReliability: 1.00,
    maxLegs: 5, formBonus: 0,
  });
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 3);

  // ── 3. Goal Scorers — goals only, max 4, each ≥ 3.2/10 ──────────────────
  const goalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.50, maxFlatHR: 1.00, minFraction: 0.40,
    minReliability: 0.32, maxReliability: 1.00,
    maxLegs: 4, statsFilter: ["G"], formBonus: 0,
  });

  // ── 4. Disposals — max 5, each ≥ 4.2/10 ─────────────────────────────────
  const disposalLegs = buildLegs(all, propOdds, {
    minFlatHR: 0.60, maxFlatHR: 1.00, minFraction: 0.55,
    minReliability: 0.42, maxReliability: 1.00,
    maxLegs: 5, statsFilter: ["D"], formBonus: 0,
  });

  // ── 5. Ballsy — max 3 legs ────────────────────────────────────────────────
  // Pass A: on-form players (last 3g ≥ avg × 1.10) pushed to higher threshold
  //         (minFraction 1.00 = starts at 100% of avg → hard threshold).
  // Pass B: regular bold picks (any player, 35–62% flat HR, hard threshold).
  // Merge, dedup, take top 3 by reliability. Combined ~5–15% is honest.
  const onFormProfiles = all.filter(p => p.isOnForm);
  const ballsyOnForm   = buildLegs(onFormProfiles, propOdds, {
    minFlatHR: 0.30, maxFlatHR: 0.65, minFraction: 1.00, maxFraction: 2.0,
    minReliability: 0.15, maxReliability: 0.58,
    maxLegs: 5, formBonus: 0.05,
  });

  const ballsyRegular = buildLegs(all, propOdds, {
    minFlatHR: 0.35, maxFlatHR: 0.62, minFraction: 0.85, maxFraction: 1.8,
    minReliability: 0.15, maxReliability: 0.55,
    maxLegs: 5, formBonus: 0,
  });

  // Merge: on-form legs first (they get priority), then fill with regular
  const ballsySeen = new Set<string>();
  const ballsyMerged: KitchenLeg[] = [];
  for (const leg of [...ballsyOnForm, ...ballsyRegular]) {
    const key = `${leg.player}|${leg.stat}|${leg.threshold}`;
    if (ballsySeen.has(key)) continue;
    ballsySeen.add(key);
    ballsyMerged.push(leg);
    if (ballsyMerged.length >= 3) break;
  }
  const ballsyLegs = ballsyMerged;

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
    { type: "goalscorers", legs: goalLegs },
    { type: "disposals",   legs: disposalLegs },
    { type: "ballsy",      legs: ballsyLegs },
    { type: "value",       legs: valueLegs },
  ];
}
