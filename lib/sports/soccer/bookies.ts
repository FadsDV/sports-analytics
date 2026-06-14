/**
 * Soccer Bookie Market Rules
 *
 * Defines which stats each bookie supports and what threshold values are valid.
 * Used by the bookie-specific kitchen to snap computed thresholds to real lines.
 *
 * Source: bet365 EPL SGM markets reference doc
 */

import type { SoccerStatKey } from "./kitchen";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SoccerBookieKey = "bet365" | "dabble";

type SoccerMarketStat = SoccerStatKey | "teamGoals" | "matchGoals" | "btts" | "corners" | "totalCards" | "totalShots";

export interface SoccerBookieStatConfig {
  available:  boolean;
  validLines: number[];
  snapDown?:  boolean;
}

export interface SoccerBookieConfig {
  key:   SoccerBookieKey;
  label: string;
  color: string;
  logo:  string;
  stats: Record<SoccerMarketStat, SoccerBookieStatConfig>;
}

// ─── Bet365 ───────────────────────────────────────────────────────────────────

export const SOCCER_BET365: SoccerBookieConfig = {
  key:   "bet365",
  label: "Bet365",
  color: "#00A651",
  logo:  "365",

  stats: {
    // ── Player stats ───────────────────────────────────────────────────────
    goals:          { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    scoreOrAssist:  { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    assists:        { available: true,  validLines: [0.5, 1.5],            snapDown: true },
    shotsOnTarget:  { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    shots:          { available: true,  validLines: [1.5, 2.5, 3.5],       snapDown: true },
    yellowCards:    { available: true,  validLines: [0.5, 1.5],            snapDown: true },
    // Not available on Bet365 SGM
    tackles:        { available: false, validLines: [] },
    foulsCommitted: { available: false, validLines: [] },
    saves:          { available: false, validLines: [] },
    xG:             { available: false, validLines: [] },
    // ── Match / team stats ─────────────────────────────────────────────────
    teamGoals:      { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    matchGoals:     { available: true,  validLines: [1.5, 2.5, 3.5, 4.5],  snapDown: true },
    btts:           { available: true,  validLines: [0.5],                  snapDown: false }, // binary
    corners:        { available: true,  validLines: [7.5, 8.5, 9.5, 10.5], snapDown: true },
    totalCards:     { available: true,  validLines: [2.5, 3.5, 4.5],        snapDown: true },
    totalShots:     { available: false, validLines: [] },
  },
};

// ─── Dabble ───────────────────────────────────────────────────────────────────
// Dabble supports SGM for soccer — player goals, score/assist, shots on target,
// cards. Lines differ from Bet365 (Dabble allows 2+ for goals, more card lines).

export const SOCCER_DABBLE: SoccerBookieConfig = {
  key:   "dabble",
  label: "Dabble",
  color: "#FF6B35",
  logo:  "DAB",

  stats: {
    // ── Player stats ───────────────────────────────────────────────────────
    goals:          { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    scoreOrAssist:  { available: true,  validLines: [0.5, 1.5],            snapDown: true },
    assists:        { available: true,  validLines: [0.5, 1.5],            snapDown: true },
    shotsOnTarget:  { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    shots:          { available: true,  validLines: [1.5, 2.5, 3.5],       snapDown: true },
    yellowCards:    { available: true,  validLines: [0.5],                  snapDown: true },
    // Not available on Dabble SGM
    tackles:        { available: false, validLines: [] },
    foulsCommitted: { available: false, validLines: [] },
    saves:          { available: false, validLines: [] },
    xG:             { available: false, validLines: [] },
    // ── Match / team stats ─────────────────────────────────────────────────
    teamGoals:      { available: true,  validLines: [0.5, 1.5, 2.5],       snapDown: true },
    matchGoals:     { available: true,  validLines: [1.5, 2.5, 3.5, 4.5],  snapDown: true },
    btts:           { available: true,  validLines: [0.5],                  snapDown: false },
    corners:        { available: true,  validLines: [8.5, 9.5, 10.5],      snapDown: true },
    totalCards:     { available: true,  validLines: [2.5, 3.5, 4.5],       snapDown: true },
    totalShots:     { available: false, validLines: [] },
  },
};

export const SOCCER_BOOKIES: Record<SoccerBookieKey, SoccerBookieConfig> = {
  bet365: SOCCER_BET365,
  dabble: SOCCER_DABBLE,
};

// ─── Snap logic ───────────────────────────────────────────────────────────────

export function snapSoccerThreshold(
  threshold: number,
  stat:      SoccerMarketStat,
  bookie:    SoccerBookieConfig,
): number | null {
  const config = bookie.stats[stat];
  if (!config.available || config.validLines.length === 0) return null;

  const lines = config.validLines;

  if (config.snapDown !== false) {
    // Snap DOWN: highest valid line ≤ threshold
    const floor = [...lines].reverse().find(l => l <= threshold);
    return floor ?? null;
  } else {
    // Snap to nearest (for binary markets like btts)
    let nearest = lines[0];
    let minDist  = Math.abs(threshold - lines[0]);
    for (const l of lines) {
      const d = Math.abs(threshold - l);
      if (d < minDist) { minDist = d; nearest = l; }
    }
    return nearest;
  }
}

// ─── Slip filter ──────────────────────────────────────────────────────────────

import type { SoccerKitchenSlip, SoccerKitchenLeg } from "./kitchen";

/**
 * Filter and snap a set of soccer kitchen slips to a specific bookie's
 * valid lines. Legs that use unavailable stats or snap below the minimum
 * valid line are dropped. Slips with zero remaining legs pass through as
 * empty (the UI handles them gracefully).
 */
export function filterSoccerSlipsForBookie(
  slips:  SoccerKitchenSlip[],
  bookie: SoccerBookieConfig,
): SoccerKitchenSlip[] {
  return slips.map(slip => {
    const filteredLegs: SoccerKitchenLeg[] = [];

    for (const leg of slip.legs) {
      const stat = leg.stat as SoccerMarketStat;
      const snapped = snapSoccerThreshold(leg.threshold, stat, bookie);
      if (snapped === null) continue; // stat unavailable or below min line

      filteredLegs.push(snapped === leg.threshold ? leg : { ...leg, threshold: snapped });
    }

    return { ...slip, legs: filteredLegs };
  });
}
