/**
 * Absence Impact System.
 *
 * When a key player is OUT for tonight's game, we scan their teammates' recent
 * history looking for games where that key player was also absent (by detecting
 * a zero/missing entry in the shared boxscore).
 *
 * This is purely a matchup-level bonus — it does NOT alter stored averages.
 *
 * Architecture notes:
 * - Sport-agnostic core: receives generic game log arrays.
 * - Sport-specific "key player" detection lives in NBA/AFL adapter layers.
 * - Contextual bonus is additive, capped at +0.20 per leg.
 */

import type { AbsenceImpact } from "./types";

// ─── Improvement rate → raw bonus table ──────────────────────────────────────

function improvementRateToBonus(ir: number): number {
  if (ir >= 1.00) return 0.18;
  if (ir >= 0.75) return 0.13;
  if (ir >= 0.50) return 0.06;
  return 0;
}

// ─── Magnitude scale ──────────────────────────────────────────────────────────

/**
 * Scale the raw bonus by how large the stat increase actually is.
 * If the increase is marginal (e.g. +1 PTS when threshold is +4),
 * the bonus shrinks. If it's twice the meaningful threshold, bonus maxes.
 */
function magnitudeScale(increase: number, meaningfulThreshold: number): number {
  return Math.min(1.5, 1 + increase / meaningfulThreshold);
}

// ─── Per-stat meaningful increase thresholds ─────────────────────────────────

export const NBA_MEANINGFUL_THRESHOLDS: Record<string, number> = {
  PTS:  4,
  REB:  2,
  AST:  2,
  FG3M: 0.8,
  MIN:  5,
};

export const AFL_MEANINGFUL_THRESHOLDS: Record<string, number> = {
  D: 6,
  G: 0.5,
  M: 2,
  T: 1.5,
};

// ─── Key player detection ─────────────────────────────────────────────────────

export interface KeyPlayerStats {
  name:      string;
  /** Average minutes (NBA) or average disposals/goals (AFL key metric) */
  avgLoad:   number;
  avgPTS?:   number;   // NBA
  avgCombo?: number;   // NBA: PTS+REB+AST
  avgG?:     number;   // AFL: goals
  avgD?:     number;   // AFL: disposals
}

export function isNBAKeyPlayer(p: KeyPlayerStats): boolean {
  return (
    p.avgLoad >= 28 ||
    (p.avgPTS !== undefined && p.avgPTS >= 18) ||
    (p.avgCombo !== undefined && p.avgCombo >= 28)
  );
}

export function isAFLKeyPlayer(p: KeyPlayerStats): boolean {
  return (
    (p.avgD !== undefined && p.avgD >= 22) ||
    (p.avgG !== undefined && p.avgG >= 1.5)
  );
}

// ─── Core absence analysis ────────────────────────────────────────────────────

export interface AbsenceGame {
  /** The stat value for the beneficiary in this game */
  beneficiaryStat: number;
  /** Whether the absent key player appears in this game's boxscore */
  keyPlayerPresent: boolean;
}

/**
 * Analyse a beneficiary's history, splitting into "key player absent" vs "present".
 *
 * @param history    Per-game stat values for the beneficiary, oldest first.
 * @param presenceHistory  Per-game boolean: was the key player present? Same length as history.
 * @param stat       Stat name (for label only).
 * @param avgNormal  Beneficiary's baseline average (used to compute increase).
 * @param meaningfulThreshold  Minimum increase considered "meaningful" for this stat.
 * @param beneficiaryName
 * @param absentPlayerName
 */
export function analyseAbsenceImpact(params: {
  history:              number[];
  presenceHistory:      boolean[];
  stat:                 string;
  avgNormal:            number;
  meaningfulThreshold:  number;
  beneficiaryName:      string;
  absentPlayerName:     string;
  preferWithinLast:     number;  // prefer absence games within last N games
}): AbsenceImpact | null {
  const {
    history, presenceHistory, stat, avgNormal, meaningfulThreshold,
    beneficiaryName, absentPlayerName, preferWithinLast,
  } = params;

  if (history.length !== presenceHistory.length) return null;

  // Find games where key player was absent
  const absenceGames: Array<{ val: number; recency: number }> = [];
  for (let i = 0; i < history.length; i++) {
    if (!presenceHistory[i]) {
      const recencyIndex = history.length - 1 - i; // 0 = most recent
      absenceGames.push({ val: history[i], recency: recencyIndex });
    }
  }

  // Need at least 2 absence games
  if (absenceGames.length < 2) return null;

  // Sort: prefer games within last `preferWithinLast`, then by recency
  const recentAbsence = absenceGames.filter(g => g.recency < preferWithinLast);
  const usedGames     = recentAbsence.length >= 2 ? recentAbsence : absenceGames;

  const avgAbsence  = usedGames.reduce((s, g) => s + g.val, 0) / usedGames.length;
  const increase    = avgAbsence - avgNormal;

  // Only positive increases count
  if (increase <= 0) return null;

  const improved        = usedGames.filter(g => g.val > avgNormal).length;
  const improvementRate = improved / usedGames.length;

  const rawBonusBase = improvementRateToBonus(improvementRate);
  if (rawBonusBase === 0) return null;

  const scale    = magnitudeScale(increase, meaningfulThreshold);
  const rawBonus = Math.min(0.20, rawBonusBase * scale);

  return {
    beneficiary:      beneficiaryName,
    absentPlayer:     absentPlayerName,
    stat,
    avgIncrease:      Math.round(increase * 10) / 10,
    absenceGames:     usedGames.length,
    improvementRate:  Math.round(improvementRate * 100) / 100,
    rawBonus:         Math.round(rawBonus * 1000) / 1000,
  };
}
