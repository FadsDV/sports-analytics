/**
 * Reliability Engine — sport-agnostic core.
 *
 * Formula:
 *   reliability = weightedHitRate × consistencyFactor × sampleFactor × minutesFactor
 *                 + contextualBonus
 *
 * All sport-specific tuning lives in SportReliabilityConfig.
 * Sports call computeReliability() and receive a full ReliabilityBreakdown.
 */

import type {
  ReliabilityBreakdown,
  SportReliabilityConfig,
  CVBand,
  MinutesBracket,
} from "./types";

// ─── Default sport configs ────────────────────────────────────────────────────

/** Standard CV bands — same starting point for both sports. Override per-sport if needed. */
const DEFAULT_CV_BANDS: CVBand[] = [
  { maxCV: 0.15, factor: 1.15 },  // very consistent
  { maxCV: 0.25, factor: 1.08 },  // consistent
  { maxCV: 0.40, factor: 1.00 },  // neutral
  { maxCV: 0.55, factor: 0.90 },  // volatile
  { maxCV: Infinity, factor: 0.78 }, // very volatile
];

/** Standard sample weights for a 10-game window. */
const DEFAULT_SAMPLE_WEIGHTS: Record<number, number> = {
  5: 0.65,
  6: 0.75,
  7: 0.83,
  8: 0.90,
  9: 0.95,
};
// 10+ games → 1.00 (handled in getSampleFactor)

export const NBA_CONFIG: SportReliabilityConfig = {
  lambda:           0.82,
  gameWindow:       10,
  minGames:         5,
  sampleWeights:    DEFAULT_SAMPLE_WEIGHTS,
  cvBands:          DEFAULT_CV_BANDS,
  useMinutesFactor: true,
};

export const AFL_CONFIG: SportReliabilityConfig = {
  lambda:           0.82,
  gameWindow:       10,
  minGames:         5,
  sampleWeights:    DEFAULT_SAMPLE_WEIGHTS,
  cvBands:          DEFAULT_CV_BANDS,
  useMinutesFactor: false,
};

// ─── NBA minutes brackets (linear interpolation within each bracket) ──────────

const NBA_MINUTES_BRACKETS: MinutesBracket[] = [
  { minMPG: 34,   maxMPG: Infinity, factorAtMin: 1.00, factorAtMax: 1.00 },
  { minMPG: 28,   maxMPG: 34,       factorAtMin: 0.85, factorAtMax: 1.00 },
  { minMPG: 22,   maxMPG: 28,       factorAtMin: 0.65, factorAtMax: 0.85 },
  { minMPG: 18,   maxMPG: 22,       factorAtMin: 0.50, factorAtMax: 0.65 },
  { minMPG: 12,   maxMPG: 18,       factorAtMin: 0.35, factorAtMax: 0.50 },
  { minMPG: 0,    maxMPG: 12,       factorAtMin: 0.30, factorAtMax: 0.35 },
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

// ─── Factor calculators ───────────────────────────────────────────────────────

/**
 * Compute recency-weighted hit rate.
 * vals[0] is the OLDEST game, vals[n-1] is the MOST RECENT.
 * We reverse so i=0 = most recent, then apply weight λ^i.
 */
function weightedHitRate(
  vals:      number[],
  threshold: number,
  lambda:    number,
  window:    number,
): number {
  // Take the most recent `window` games
  const slice   = vals.slice(-window);
  const rev     = [...slice].reverse(); // rev[0] = most recent
  let   sumW    = 0;
  let   sumHits = 0;

  for (let i = 0; i < rev.length; i++) {
    const w = Math.pow(lambda, i);
    sumW    += w;
    if (rev[i] >= threshold) sumHits += w;
  }

  return sumW > 0 ? sumHits / sumW : 0;
}

function consistencyFactor(vals: number[], cvBands: CVBand[]): number {
  const avg = mean(vals);
  if (avg === 0) return 1.0;
  const cv  = stddev(vals) / avg;

  for (const band of cvBands) {
    if (cv < band.maxCV) return band.factor;
  }
  // fallback — should never reach here if last band has maxCV=Infinity
  return cvBands[cvBands.length - 1]?.factor ?? 1.0;
}

function getSampleFactor(
  games:         number,
  minGames:      number,
  sampleWeights: Record<number, number>,
): number {
  if (games < minGames) return 0; // ineligible
  const exactWeight = sampleWeights[games];
  if (exactWeight !== undefined) return exactWeight;
  // games >= highest key → 1.00
  return 1.00;
}

/**
 * NBA-specific minutes factor via linear interpolation within brackets.
 * avgMinutes = average minutes per game across the sample window.
 */
export function nbaMinutesFactor(avgMinutes: number): number {
  for (const bracket of NBA_MINUTES_BRACKETS) {
    if (avgMinutes >= bracket.minMPG) {
      if (bracket.maxMPG === Infinity) return bracket.factorAtMin;
      // Linear interpolation within the bracket
      const t = (avgMinutes - bracket.minMPG) / (bracket.maxMPG - bracket.minMPG);
      return bracket.factorAtMin + t * (bracket.factorAtMax - bracket.factorAtMin);
    }
  }
  return 0.30; // below all brackets
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ReliabilityInput {
  /** Historical stat values, oldest first. */
  vals:             number[];
  /** The threshold being evaluated (OVER). */
  threshold:        number;
  /**
   * Average minutes per game (NBA only).
   * Leave undefined or 0 for AFL — minutesFactor will be 1.0.
   */
  avgMinutes?:      number;
  /**
   * Additive contextual bonus from absence-impact analysis.
   * Capped at 0.20 externally; engine clamps to [0, 0.20] as a safeguard.
   */
  contextualBonus?: number;
  /** Sport config. Defaults to AFL_CONFIG if omitted. */
  config?:          SportReliabilityConfig;
}

export function computeReliability(input: ReliabilityInput): ReliabilityBreakdown {
  const cfg     = input.config ?? AFL_CONFIG;
  const vals    = input.vals;
  const bonus   = Math.min(0.20, Math.max(0, input.contextualBonus ?? 0));

  // Use only the game window
  const window  = vals.slice(-cfg.gameWindow);
  const games   = window.length;

  const sFactor = getSampleFactor(games, cfg.minGames, cfg.sampleWeights);

  // Ineligible player — return zeroed breakdown
  if (sFactor === 0) {
    return {
      weightedHitRate:   0,
      consistencyFactor: 1.0,
      sampleFactor:      0,
      minutesFactor:     1.0,
      contextualBonus:   bonus,
      finalReliability:  0,
    };
  }

  const whr     = weightedHitRate(vals, input.threshold, cfg.lambda, cfg.gameWindow);
  const cFactor = consistencyFactor(window, cfg.cvBands);
  const mFactor = cfg.useMinutesFactor && input.avgMinutes !== undefined && input.avgMinutes > 0
    ? nbaMinutesFactor(input.avgMinutes)
    : 1.0;

  const core    = whr * cFactor * sFactor * mFactor;
  const final   = Math.min(1.0, core + bonus);

  return {
    weightedHitRate:   Math.round(whr    * 1000) / 1000,
    consistencyFactor: Math.round(cFactor * 1000) / 1000,
    sampleFactor:      Math.round(sFactor * 1000) / 1000,
    minutesFactor:     Math.round(mFactor * 1000) / 1000,
    contextualBonus:   Math.round(bonus   * 1000) / 1000,
    finalReliability:  Math.round(final   * 1000) / 1000,
  };
}
