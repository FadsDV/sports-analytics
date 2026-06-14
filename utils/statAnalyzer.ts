/**
 * Heuristic stat analyzer for player bet reliability scoring.
 * Works across AFL, NBA, soccer — just supply the stat values and context.
 */

export type GameWindow = {
  value: number;
  homeAway: "home" | "away";
  opponentRank?: number; // lower = tougher opponent
};

export type ReliabilityTier = "strong" | "moderate" | "weak";

export type ReliabilityResult = {
  confidence: number;      // 0..1 weighted composite score
  tier: ReliabilityTier;
  hitRate: number;         // fraction of games in window meeting threshold
  trend: "up" | "flat" | "down";
  homeEdge: number;        // positive = better at home
  avg: number;
  sd: number;
  gamesUsed: number;
  hitsInWindow: number;
};

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (!arr.length) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute a reliability score for a player on a specific stat threshold.
 *
 * @param games    Per-game stat values, newest first.
 * @param threshold  The "over" line to evaluate against (e.g. 20 disposals).
 * @param window   How many recent games to inspect (default 5, max 10).
 */
export function computeReliability(
  games: GameWindow[],
  threshold: number,
  window = 5,
): ReliabilityResult {
  const slice = games.slice(0, Math.min(window, 10));
  const vals  = slice.map(g => g.value);

  if (!vals.length) {
    return {
      confidence: 0, tier: "weak", hitRate: 0, trend: "flat",
      homeEdge: 0, avg: 0, sd: 0, gamesUsed: 0, hitsInWindow: 0,
    };
  }

  // ── Threshold frequency ───────────────────────────────────────────
  const hitsInWindow = vals.filter(v => v >= threshold).length;
  const hitRate = hitsInWindow / vals.length;

  // ── Trend: mean of last 3 vs prior 3 (chronological) ─────────────
  const chron  = [...vals].reverse();
  const n      = chron.length;
  const last3  = mean(chron.slice(Math.max(0, n - 3)));
  const prior3 = mean(chron.slice(Math.max(0, n - 6), Math.max(0, n - 3)));
  const trendDelta = last3 - prior3;
  const trend: "up" | "flat" | "down" =
    trendDelta >  1.5 ? "up" :
    trendDelta < -1.5 ? "down" : "flat";

  // ── Home / Away split ─────────────────────────────────────────────
  const homeVals = slice.filter(g => g.homeAway === "home").map(g => g.value);
  const awayVals = slice.filter(g => g.homeAway === "away").map(g => g.value);
  const homeEdge = (homeVals.length && awayVals.length)
    ? mean(homeVals) - mean(awayVals) : 0;

  // ── Consistency ───────────────────────────────────────────────────
  const avg = mean(vals);
  const sd  = stddev(vals);
  const consistencyScore = clamp01(1 - sd / Math.max(1, avg));

  // ── Opponent adjustment ───────────────────────────────────────────
  const ranks   = slice.map(g => g.opponentRank ?? 9); // default mid-table
  const oppAdj  = clamp01(mean(ranks) / 9); // scale: 1 = easy opponents

  // ── Composite confidence (weighted) ──────────────────────────────
  const trendScore = clamp01(0.5 + trendDelta / (threshold * 2));
  const confidence = clamp01(
    hitRate         * 0.40 +
    trendScore      * 0.25 +
    consistencyScore * 0.20 +
    oppAdj          * 0.10 +
    0.05, // floor
  );

  const tier: ReliabilityTier =
    confidence >= 0.65 && hitRate >= 0.60 ? "strong"  :
    confidence >= 0.45 || hitRate >= 0.40 ? "moderate" : "weak";

  return { confidence, tier, hitRate, trend, homeEdge, avg, sd, gamesUsed: vals.length, hitsInWindow };
}

/**
 * Build a GameWindow array from AFL player games (newest first).
 */
export function aflGamesToWindows(
  games: { value: number | null; homeAway: "home" | "away" }[]
): GameWindow[] {
  return games
    .filter(g => g.value != null)
    .map(g => ({ value: g.value!, homeAway: g.homeAway }));
}

/** Confidence badge text */
export function tierLabel(tier: ReliabilityTier): string {
  return tier === "strong" ? "STRONG" : tier === "moderate" ? "WATCH" : "RISKY";
}

/** Tailwind color classes per tier */
export function tierColors(tier: ReliabilityTier) {
  if (tier === "strong")   return { bg: "bg-[#22C55E]/15", text: "text-[#22C55E]", border: "border-[#22C55E]/30" };
  if (tier === "moderate") return { bg: "bg-[#F59E0B]/15", text: "text-[#F59E0B]", border: "border-[#F59E0B]/30" };
  return { bg: "bg-[#EF4444]/15", text: "text-[#EF4444]", border: "border-[#EF4444]/30" };
}
