/**
 * AFL Kitchen — 6-slip bet slip generator.
 *
 * Slip types:
 *   safe        — 80%+ hit rate, conservative thresholds (avg × 0.50 floor), max 5 legs
 *   doable      — 70%+ hit rate, moderate thresholds (avg × 0.65 floor), max 5 legs
 *   goalscorers — 1+ goal at 55%+ hit rate, max 5 legs
 *   disposals   — disposal legs only, 65%+, max 9 legs
 *   ballsy      — 40–62% hit rate, high thresholds, bounce-back bonus, max 8 legs
 *   value       — single legs, odds > 1.60, top 10 by (hitRate × odds)
 *
 * Same player can appear max 2× in one slip (different stat or threshold).
 * Bounce-back detection: if last game was < 65% of player's average, flag as
 * a value candidate for the upcoming game (used in ballsy + value slips).
 */

import type { AFLGamePlayerStats } from "@/lib/sports/espn";
import type { AFLPickStat } from "./picks";

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

// Minimum average a player needs to generate a pick for this stat
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
 * Find the HIGHEST threshold in [avg * minFraction … avg * 1.6] where
 * hit rate is within [minHR, maxHR].
 */
function findBestThreshold(
  vals:        number[],
  avg:         number,
  stat:        AFLPickStat,
  minHR:       number,
  maxHR:       number,
  minFraction: number,
): { threshold: number; hitRate: number } | null {
  const step = STEP[stat];
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
  vals:          number[];   // all games, chronological (oldest → newest)
  avg:           number;
  isBounceBack:  boolean;    // last game < 65% of average
  gamesAnalyzed: number;
}

function buildProfiles(
  gamesByGame: AFLGamePlayerStats[][],
  teamId:      string,
  side:        "home" | "away",
  teamAbbr:    string,
): Profile[] {
  // Accumulate stats per player across all games
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
      if (vals.length < 3) continue;
      const avg = mean(vals);
      if (avg < MIN_AVG[stat]) continue;

      // Most recent game = last element (schedule slice is oldest → newest)
      const lastGame = vals[vals.length - 1] ?? 0;
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
  statsFilter?:      AFLPickStat[],
  bounceBonusWeight: number = 0,
): KitchenLeg[] {
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

  const legs: KitchenLeg[] = [];
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

  // ── 1. Safe — 80%+ hit rate, conservative thresholds ─────────────────────
  const safeLegs = buildLegs(all, propOdds, 0.80, 1.0, 0.50, 5);

  // ── 2. Doable — 70%+ hit rate, moderate thresholds ───────────────────────
  // Use a higher floor fraction so thresholds are more demanding than Safe
  const doableRaw = buildLegs(all, propOdds, 0.70, 1.0, 0.65, 7);
  // Deduplicate: skip exact player+stat+threshold combos already in Safe
  const safeKeys = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableLegs = doableRaw
    .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`))
    .slice(0, 5);

  // ── 3. Goal Scorers — goals only, 55%+, max 5 ────────────────────────────
  const goalLegs = buildLegs(
    all.filter(p => p.stat === "G"),
    propOdds, 0.55, 1.0, 0.40, 5, ["G"],
  );

  // ── 4. Disposals Only — 65%+, max 9 legs ─────────────────────────────────
  const disposalLegs = buildLegs(
    all, propOdds, 0.65, 1.0, 0.55, 9, ["D"],
  );

  // ── 5. Ballsy — 40–62% hit rate, high thresholds, bounce-back bonus ───────
  const ballsyLegs = buildLegs(
    all, propOdds, 0.40, 0.64, 0.82, 8,
    undefined, 0.15,
  );

  // ── 6. Value Picks — single legs, odds > 1.60, top 10 ────────────────────
  const valueCandidates: Array<{ leg: KitchenLeg; score: number }> = [];
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
    { type: "goalscorers", legs: goalLegs },
    { type: "disposals",   legs: disposalLegs },
    { type: "ballsy",      legs: ballsyLegs },
    { type: "value",       legs: valueLegs },
  ];
}
