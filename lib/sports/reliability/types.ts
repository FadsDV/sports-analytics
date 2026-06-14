/**
 * Reliability Engine — shared types.
 *
 * The core engine is sport-agnostic.
 * Sports supply a `SportConfig` to tune every factor.
 */

// ─── Breakdown (per-leg explainability) ──────────────────────────────────────

export interface ReliabilityBreakdown {
  /** Recency-weighted fraction of games where threshold was hit (0–1) */
  weightedHitRate:    number;
  /** Consistency multiplier based on CV of stat values (0.78–1.15) */
  consistencyFactor:  number;
  /** Sample size multiplier. <5 games → 0 (ineligible) */
  sampleFactor:       number;
  /** Minutes/TOG load factor. 1.0 if not applicable for this sport */
  minutesFactor:      number;
  /** Additive contextual bonus from absence-impact analysis (0–0.20) */
  contextualBonus:    number;
  /** Final composite score = weightedHitRate × consistency × sample × minutes + bonus */
  finalReliability:   number;
}

// ─── CV bands (configurable per sport) ───────────────────────────────────────

export interface CVBand {
  /** Upper bound of this band (exclusive, except the last one which is ∞) */
  maxCV:   number;
  /** Multiplier applied when CV falls in this band */
  factor:  number;
}

// ─── Sport config ─────────────────────────────────────────────────────────────

export interface SportReliabilityConfig {
  /**
   * Exponential decay λ for recency weighting.
   * weight(i) = λ^i  where i=0 is most recent game.
   * Higher λ = slower decay = older games matter more.
   * Default: 0.82
   */
  lambda: number;

  /**
   * Number of recent games to include in the window.
   * Games beyond this are ignored.
   */
  gameWindow: number;

  /**
   * Minimum number of games in the window for a leg to be eligible.
   * Below this → sampleFactor = 0 → leg is excluded.
   */
  minGames: number;

  /**
   * Sample-size multiplier table. Key = exact game count.
   * Any count >= highest key → 1.00.
   */
  sampleWeights: Record<number, number>;

  /**
   * CV bands, sorted ascending by maxCV.
   * The last band's maxCV is ignored (it catches everything above).
   */
  cvBands: CVBand[];

  /**
   * Whether this sport uses a minutes/load factor.
   * If false, minutesFactor is always 1.0.
   */
  useMinutesFactor: boolean;
}

// ─── Minutes brackets (NBA-specific) ─────────────────────────────────────────

export interface MinutesBracket {
  /** Lower bound of this bracket (inclusive) */
  minMPG:  number;
  /** Upper bound of this bracket (exclusive, or Infinity for the top bracket) */
  maxMPG:  number;
  /** Factor at the lower bound (linearly interpolated to the next bracket's lower factor) */
  factorAtMin: number;
  /** Factor at the upper bound */
  factorAtMax: number;
}

// ─── Absence impact (contextual bonus input) ──────────────────────────────────

export interface AbsenceImpact {
  /** The player receiving the bonus */
  beneficiary:      string;
  /** The absent player whose absence drives the bonus */
  absentPlayer:     string;
  /** Stat that increases */
  stat:             string;
  /** Average increase in this stat during absence games */
  avgIncrease:      number;
  /** Number of absence games analysed */
  absenceGames:     number;
  /** Fraction of absence games where beneficiary improved */
  improvementRate:  number;
  /** Raw contextual bonus before capping (0–0.20) */
  rawBonus:         number;
}
