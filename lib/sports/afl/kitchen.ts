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
 *
 * Phase 3–5 — Intelligence Signals:
 *   Each leg's reliability is adjusted by up to ±0.25 based on five signals:
 *     1. Rest days      — <6 days since last game: −0.05 (fatigue penalty)
 *     2. Venue history  — player's avg at this ground vs season avg (±0.08 max)
 *     3. Opponent rank  — team-style: what opponent CONCEDES vs our typical output
 *                         Fires every game — no direct matchup frequency required.
 *     4. Weather        — rain/wind penalise scoring; calm/sunny adds small bonus
 *     5. Injury uplift  — player historically outperforms when key teammate (≥18D avg)
 *                         is ruled out; based on "without" evidence in 8-game window
 */

import type { AFLGamePlayerStats } from "@/lib/sports/espn";
import type { AFLPickStat } from "./picks";
import { computeReliability, AFL_CONFIG } from "@/lib/sports/reliability/engine";
import type { ReliabilityBreakdown } from "@/lib/sports/reliability/types";
import { normalizeAFLName } from "./fantasyMapper";

// ─── Intelligence context ─────────────────────────────────────────────────────

/**
 * Per-game metadata for a completed AFL game in the history window.
 * Extracted from ESPN team schedule data and passed into the kitchen.
 */
export interface AFLGameMeta {
  /** ESPN venue name (e.g. "Melbourne Cricket Ground") */
  venueName:  string;
  /** ESPN team ID of the OPPONENT in that game */
  opponentId: string;
  /** ISO 8601 date string from ESPN (e.g. "2025-04-12T08:35Z") */
  gameDate:   string;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type KitchenSlipType =
  | "peter"
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
  /**
   * Net intelligence signal applied to this leg's reliability.
   * Positive = favorable context (good venue/opponent/rest).
   * Negative = unfavorable context (bad weather/fatigue/tough opponent).
   */
  signalTotal?:  number;
  /**
   * Estimated bookmaker price for this leg, derived from hit rate when no
   * live market price is available. Replace with prop.price when scraper runs.
   */
  estimatedOdds?: number;
  /** Most recent game's value for this stat (bounce-back display). */
  lastGameStat?:  number;
  /** How far below the recent average the last game sat (0–1 fraction). */
  bounceBackEdge?: number;
  /** Peter/value flag: genuine bounce-back value leg (player due to bounce back). */
  isValue?:       boolean;
}

export interface KitchenSlip {
  type: KitchenSlipType;
  legs: KitchenLeg[];
  /**
   * Estimated combined SGM odds for the whole slip when no live prices exist:
   *   product(1 / leg.hitRate) × 0.72  (0.72 = same-game correlation discount).
   */
  estimatedOdds: number;
  /** Back-compat alias for estimatedOdds (older consumers). */
  estimatedCombinedOdds?: number;
}

// ─── Internal config ──────────────────────────────────────────────────────────

const STAT_LABELS: Record<AFLPickStat, string> = {
  D: "disposals", G: "goals", M: "marks", T: "tackles", HO: "hitouts",
  K: "kicks", H: "handballs",
};

const STEP: Record<AFLPickStat, number> = {
  D: 1, G: 0.5, M: 1, T: 1, HO: 2, K: 1, H: 1,
};

const MIN_AVG: Record<AFLPickStat, number> = {
  D: 8, G: 0.35, M: 2, T: 2, HO: 3, K: 4, H: 3,
};

// ─── Math ─────────────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function calcHitRate(vals: number[], thr: number): number {
  return vals.length ? vals.filter(v => v >= thr).length / vals.length : 0;
}

// ─── Odds estimation (no live prices yet) ──────────────────────────────────────

/** Same-game-multi correlation discount applied to combined estimated odds. */
const SGM_CORRELATION_DISCOUNT = 0.72;

/**
 * Estimate what a single leg is worth from its historical hit rate.
 *
 * Formula: estimated leg odds = 1 / hitRate (raw probability inverse).
 * We deliberately do NOT subtract a bookmaker margin here — the margin is
 * already captured by the SGM correlation discount applied to the combined
 * figure. At a 90% hit rate this gives ~1.11; at 85% ~1.18.
 *
 * Edge case: a 100% hit rate would yield exactly 1.00 (no value), and a 0%
 * hit rate is undefined — both are clamped so the estimate stays sane.
 */
function estimateLegOdds(hitRate: number): number {
  if (hitRate <= 0) return 2.0;          // no history of hitting — treat as long shot
  if (hitRate >= 1) return 1.01;         // never let a leg estimate at exactly 1.00
  const fair = 1 / hitRate;
  return Math.round(fair * 100) / 100;
}

/**
 * Estimate combined SGM odds for a set of legs.
 *
 *   estimatedCombinedOdds = product(1 / hitRate) × 0.72
 *
 * The 0.72 factor models the discount bookmakers apply to same-game multis
 * because correlated legs are worth less than independent ones.
 */
function estimateSGMOdds(legs: Array<{ hitRate: number }>): number {
  if (legs.length === 0) return 0;
  const product = legs.reduce((acc, l) => acc * estimateLegOdds(l.hitRate), 1);
  return Math.round(product * SGM_CORRELATION_DISCOUNT * 100) / 100;
}

// ─── Bounce-back detection ─────────────────────────────────────────────────────

/**
 * Detect a "bounce-back" value situation: a player whose most recent game was
 * well below their recent form. The bookmaker line may still be set
 * conservatively → the player is "due" for a big game.
 *
 * NOTE on ordering: profile vals are stored OLDEST-FIRST (ESPN game order), so
 * the most recent game is the LAST element. We read `vals[vals.length - 1]` as
 * the last game and the preceding window as the recent baseline.
 */
function detectBounceBack(vals: number[], avg: number): {
  isBounceBack:   boolean;
  lastGameStat:   number | null;
  bounceBackEdge: number; // how far below recent avg the last game was, as fraction
} {
  if (vals.length < 3) return { isBounceBack: false, lastGameStat: null, bounceBackEdge: 0 };
  const lastGame  = vals[vals.length - 1];                 // most recent game (oldest-first array)
  const recentAvg = mean(vals.slice(-6, -1));              // 5 games before the last one
  const bounceBackEdge = recentAvg > 0 ? (recentAvg - lastGame) / recentAvg : 0;
  const isBounceBack = lastGame < avg * 0.65 && recentAvg >= avg * 0.90;
  return { isBounceBack, lastGameStat: lastGame, bounceBackEdge };
}

// ─── Percentile threshold (Peter Logic) ────────────────────────────────────────

/**
 * Find the highest threshold that the player hits in at least targetHitRate fraction
 * of their recent games. This is the Peter Logic threshold — "how high can we set
 * the bar while still hitting reliably?"
 */
function findPercentileThreshold(
  vals: number[],
  targetHitRate: number,
  stat: AFLPickStat,
): { threshold: number; hitRate: number } | null {
  if (vals.length < 5) return null;
  const step = STEP[stat];
  const maxPossible = Math.max(...vals);

  let best: { threshold: number; hitRate: number } | null = null;

  for (let t = step; t <= maxPossible + step; t += step) {
    const thr = stat === "G" ? Math.round(t * 2) / 2 : Math.round(t);
    const hr = calcHitRate(vals, thr);
    if (hr >= targetHitRate) {
      if (!best || thr > best.threshold) {
        best = { threshold: thr, hitRate: hr };
      }
    }
  }
  return best;
}

/**
 * Find the best matching Sportsbet prop for a player+stat combination.
 *
 * propOdds keys are "PlayerName|stat|line" — iterates all entries for this
 * player+stat and returns the one whose line is closest to targetThreshold.
 * Used by the slip builders to attach a relevant price for display on a leg.
 */
function findBestProp(
  propOdds:        Map<string, { price: number; line: number; bookmaker: string }>,
  playerName:      string,
  stat:            AFLPickStat,
  targetThreshold: number,
): { price: number; line: number; bookmaker: string } | undefined {
  // Normalize so ESPN names ("Tom J. Lynch") match Odds API names ("Tom Lynch")
  const prefix = `${normalizeAFLName(playerName)}|${stat}|`;
  let best: { price: number; line: number; bookmaker: string } | undefined;
  let bestDist = Infinity;

  for (const [key, val] of Array.from(propOdds.entries())) {
    if (!key.startsWith(prefix)) continue;
    const dist = Math.abs(val.line - targetThreshold);
    if (dist < bestDist) { bestDist = dist; best = val; }
  }
  return best;
}

/**
 * Build the Safe slip using ONLY actual Sportsbet market lines as thresholds.
 *
 * No independent threshold computation — the exact Sportsbet line IS the bet,
 * so the price shown in the UI is always accurate.
 *
 * For each real market line, evaluates the player's historical hit rate at
 * that exact line. Keeps the best (highest hit rate) line per player+stat.
 * Sorts by hit rate desc, then greedily picks legs until combined Sportsbet
 * prices ≥ minCombinedOdds. Min minLegs, max maxLegs.
 */
function buildPropsBasedSafeSlip(
  all:             Profile[],
  propOdds:        Map<string, { price: number; line: number; bookmaker: string }>,
  minCombinedOdds: number,
  minLegs:         number,
  maxLegs:         number,
): KitchenLeg[] {
  // Quick profile lookup by "playerName|stat" — indexed by both raw ESPN name
  // and normalized name so propOdds keys (normalized) can find the right profile.
  const profileMap = new Map<string, Profile>();
  for (const p of all) {
    profileMap.set(`${p.name}|${p.stat}`, p);
    // Also index by normalized name to match propOdds keys built with normalizeAFLName()
    const normKey = `${normalizeAFLName(p.name)}|${p.stat}`;
    if (!profileMap.has(normKey)) profileMap.set(normKey, p);
  }

  // For each player+stat keep the line with the highest hit rate (safest).
  // propOdds key format: "PlayerName|STAT|LINE"
  const bestPerPlayerStat = new Map<string, { leg: KitchenLeg; hitRate: number }>();

  for (const [key, prop] of Array.from(propOdds.entries())) {
    const parts = key.split("|");
    if (parts.length !== 3) continue;
    const [playerName, statStr] = parts;
    const stat = statStr as AFLPickStat;

    const profile = profileMap.get(`${playerName}|${stat}`);
    if (!profile || profile.vals.length < 5) continue;

    const hitRate = calcHitRate(profile.vals, prop.line);
    if (hitRate < 0.65) continue;  // minimum safety threshold

    // Keep only if this line has higher hit rate than a previous line for same player+stat
    const existing = bestPerPlayerStat.get(`${playerName}|${stat}`);
    if (existing && existing.hitRate >= hitRate) continue;

    const breakdown = computeReliability({ vals: profile.vals, threshold: prop.line, config: AFL_CONFIG });

    const legSignalTotal = Math.round(
      (profile.signals.restDaysPenalty +
       profile.signals.venueBoost +
       profile.signals.opponentRankBoost +
       profile.signals.weatherPenalty +
       profile.signals.injuryUplift) * 100
    ) / 100;

    bestPerPlayerStat.set(`${playerName}|${stat}`, {
      hitRate,
      leg: {
        player:        profile.name,   // use ESPN display name, not normalized key
        side:          profile.side,
        teamAbbr:      profile.teamAbbr,
        stat,
        statLabel:     STAT_LABELS[stat],
        threshold:     prop.line,   // exact Sportsbet line — no rounding
        hitRate,
        reliability:   breakdown.finalReliability,
        breakdown,
        avgStat:       Math.round(profile.avg * 10) / 10,
        gamesAnalyzed: profile.gamesAnalyzed,
        isBounceBack:  profile.isBounceBack,
        isOnForm:      profile.isOnForm,
        prop,           // price is always accurate — threshold === prop.line
        signalTotal:   legSignalTotal,
      },
    });
  }

  // Sort by hit rate desc (safest first)
  const candidates = Array.from(bestPerPlayerStat.values())
    .sort((a, b) => b.hitRate - a.hitRate);

  // Greedily pick until combined Sportsbet prices ≥ minCombinedOdds
  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const { leg } of candidates) {
    if (selected.length >= maxLegs) break;
    const used = playerCount.get(leg.player) ?? 0;
    if (used >= 2) continue; // max 2 different stats per player

    selected.push(leg);
    playerCount.set(leg.player, used + 1);

    const combinedOdds = selected.reduce((acc, l) => acc * (l.prop!.price), 1);
    if (selected.length >= minLegs && combinedOdds >= minCombinedOdds) break;
  }

  return selected;
}

/** Count how many of the player's last `n` games had a goal (≥1). */
function goalsInLast(vals: number[], n: number): number {
  return vals.slice(-n).filter(v => v >= 1).length;
}

/**
 * True when the player's last 3 games are each strictly higher than the one
 * before — a genuine "trending up / time to shine" pattern for the Ballsy slip.
 * Needs at least 4 games (3 step-ups) so the trend is real, not a single spike.
 */
function isTrendingUp(vals: number[]): boolean {
  if (vals.length < 4) return false;
  const tail = vals.slice(-4); // [g-3, g-2, g-1, last]
  return tail[1] > tail[0] && tail[2] > tail[1] && tail[3] > tail[2];
}

/**
 * Highest threshold a player clears in at least `targetHR` of their last
 * `window` games (default 10). Returns null when there isn't enough history
 * or no line meets the bar. The threshold comes only from real game values —
 * never invented.
 */
function findThresholdAtHitRate(
  vals: number[],
  targetHR: number,
  stat: AFLPickStat,
  window = 10,
): { threshold: number; hitRate: number } | null {
  const recent = vals.slice(-window);
  if (recent.length < 5) return null;
  return findPercentileThreshold(recent, targetHR, stat);
}

// ─── Intelligence signals ─────────────────────────────────────────────────────

interface IntelligenceSignals {
  restDaysPenalty:   number;  // negative: fatigue from short turnaround
  venueBoost:        number;  // +/- based on player's history at this ground
  opponentRankBoost: number;  // +/- based on how much this stat opponent concedes
  weatherPenalty:    number;  // negative: rain/wind hurts scoring stats; positive: ideal conditions
  injuryUplift:      number;  // positive: player historically benefits when key teammate is absent
}

// ─── Injury uplift helper ─────────────────────────────────────────────────────

/** Normalise a name to lowercase letters only for fuzzy matching. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Compute per-player, per-stat injury uplift signals.
 *
 * For each "key absent" player today (status Out/Suspended, high historical avg):
 *   1. Find historical games where they didn't appear in the boxscore → "without" games
 *   2. Compare each teammate's stat in "without" games vs their season average
 *   3. Players who outperform by ≥15% when this player is absent get a boost
 *
 * Returns: Map<playerName, Map<stat, reliabilityBoost>>
 */
function computeInjuryUpliftMap(
  gamesByGame: AFLGamePlayerStats[][],
  teamId:      string,
  injuries:    { playerName: string; status: string }[],
): Map<string, Map<AFLPickStat, number>> {
  const STATS: AFLPickStat[] = ["D", "G", "M", "T", "HO", "K", "H"];
  const upliftMap = new Map<string, Map<AFLPickStat, number>>();

  // Only care about players who are ruled out
  const outNames = injuries
    .filter(i => /out|suspended/i.test(i.status))
    .map(i => normName(i.playerName));

  if (outNames.length === 0) return upliftMap;

  // For each injured player, detect which historical games they missed
  for (const absNorm of outNames) {
    // Find games where this player had a line (= was active) vs not
    const presentInGame: boolean[] = gamesByGame.map(game =>
      game.some(p => p.teamId === teamId && normName(p.name) === absNorm)
    );

    // Check they were actually a meaningful contributor (≥20 D avg when present)
    const presentGames = gamesByGame.filter((_, i) => presentInGame[i]);
    if (presentGames.length < 2) continue;
    const absentPlayer = presentGames[0].find(p => p.teamId === teamId && normName(p.name) === absNorm);
    if (!absentPlayer) continue;
    const absentAvgD = presentGames.reduce((sum, g) => {
      const p = g.find(pl => pl.teamId === teamId && normName(pl.name) === absNorm);
      return sum + (p?.D ?? 0);
    }, 0) / presentGames.length;
    if (absentAvgD < 18) continue; // Only key high-disposal players trigger uplift

    const absentGameIndices = presentInGame
      .map((present, i) => (!present ? i : -1))
      .filter(i => i >= 0);

    if (absentGameIndices.length < 2) continue;

    // For each teammate, compute their performance in "without" vs "with" games
    const teammateSeen = new Set<string>();
    for (const game of gamesByGame) {
      for (const p of game) {
        if (p.teamId === teamId) teammateSeen.add(p.name);
      }
    }

    for (const teammateName of Array.from(teammateSeen)) {
      if (normName(teammateName) === absNorm) continue;

      for (const stat of STATS) {
        // Season average (all games where they appeared)
        const allVals = gamesByGame
          .map(g => g.find(p => p.teamId === teamId && p.name === teammateName)?.[stat])
          .filter((v): v is number => v !== undefined);
        if (allVals.length < 4) continue;
        const seasonAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
        if (seasonAvg < MIN_AVG[stat]) continue;

        // "Without" game average
        const withoutVals = absentGameIndices
          .map(i => gamesByGame[i]?.find(p => p.teamId === teamId && p.name === teammateName)?.[stat])
          .filter((v): v is number => v !== undefined);
        if (withoutVals.length < 2) continue;

        const withoutAvg = withoutVals.reduce((a, b) => a + b, 0) / withoutVals.length;
        const ratio = seasonAvg > 0 ? withoutAvg / seasonAvg : 1;

        if (ratio >= 1.15) {
          // Player historically does better when absent player is out
          // Boost = (ratio - 1.0) * 0.55, capped at 0.12
          const boost = Math.min(0.12, (ratio - 1.0) * 0.55);
          if (!upliftMap.has(teammateName)) upliftMap.set(teammateName, new Map());
          const existing = upliftMap.get(teammateName)!.get(stat) ?? 0;
          upliftMap.get(teammateName)!.set(stat, Math.max(existing, boost));
        }
      }
    }
  }

  return upliftMap;
}

/**
 * Compute opponent defensive rank signal using team-style concession analysis.
 *
 * Problem with old approach: in an 18-team league over 8 games, teams almost
 * never face the same opponent twice — so grouping MY stats by opponent always
 * returned 0 due to insufficient sample (n < 2 per matchup).
 *
 * New approach — "what does the opponent concede?":
 *   1. Look at the OPPONENT's last 8 games (opponentGames).
 *   2. For each game, sum stats scored by the NON-opponent players = what
 *      the opponent conceded that game.
 *   3. concededAvg = average across games.
 *   4. Compare concededAvg to MY team's typical output (from myGames).
 *   5. Ratio > 1 → weak defense → boost. Ratio < 1 → stingy defense → penalty.
 *
 * This fires reliably every game since we use the opponent's 8-game history
 * rather than our own matchup frequency against them.
 *
 * Returns a reliability adjustment in [-0.10, +0.10].
 */
function computeOpponentRankBoost(
  myGames:        AFLGamePlayerStats[][],
  opponentGames:  AFLGamePlayerStats[][],
  myTeamId:       string,
  opponentTeamId: string,
  stat:           AFLPickStat,
): number {
  if (opponentGames.length < 3 || myGames.length < 3) return 0;

  // My team's average per-game total for this stat
  const myTotals = myGames
    .map(game => game.filter(p => p.teamId === myTeamId).reduce((s, p) => s + (p[stat] ?? 0), 0))
    .filter(t => t > 0);
  if (myTotals.length < 3) return 0;
  const myAvg = mean(myTotals);
  if (myAvg === 0) return 0;

  // What the opponent concedes per game = stat scored BY THEIR OPPONENTS
  const concededTotals = opponentGames
    .map(game => game.filter(p => p.teamId !== opponentTeamId).reduce((s, p) => s + (p[stat] ?? 0), 0))
    .filter(t => t > 0);
  if (concededTotals.length < 3) return 0;
  const concededAvg = mean(concededTotals);

  // How does the opponent's conceded rate compare to what I typically score?
  // ratio > 1 → they concede more than I usually score → favorable matchup
  // ratio < 1 → they're stingier than my usual output  → tough matchup
  const ratio = concededAvg / myAvg;
  // 20% above → +0.10 boost, 20% below → -0.10 penalty
  return Math.max(-0.10, Math.min(0.10, (ratio - 1.0) * 0.5));
}

/** Weather-derived reliability adjustment per stat.
 *  Penalties for rain/wind; small bonus for ideal calm sunny conditions.
 */
function computeWeatherPenalty(
  stat:    AFLPickStat,
  weather: { condition: string; windKph: number } | null | undefined,
): number {
  if (!weather) return 0;
  const isWet   = ["Rain", "Storm"].includes(weather.condition);
  const isIdeal = ["Sunny", "Clear", "Partly Cloudy"].includes(weather.condition);
  const wind    = weather.windKph;
  const calmDay = wind < 15 && isIdeal;

  switch (stat) {
    case "G":
      // Goals most affected: rain reduces kick-outs, high wind kills set shots
      if (calmDay) return +0.03;  // ideal day boost
      return Math.max(-0.10, (isWet ? -0.05 : 0) + (wind > 60 ? -0.06 : wind > 40 ? -0.04 : 0));
    case "D":
      // Disposals drop 10-15% in heavy rain — stronger penalty than before
      return (isWet ? -0.07 : 0) + (wind > 60 ? -0.02 : 0);
    case "M":
      // Marks harder to take in wet/windy — especially contested marks
      if (calmDay) return +0.02;
      return (isWet ? -0.03 : 0) + (wind > 40 ? -0.03 : 0);
    case "K":
      // Kicks most affected by wind — high-ball style becomes unreliable
      return (isWet ? -0.02 : 0) + (wind > 60 ? -0.05 : wind > 40 ? -0.03 : 0);
    case "H":
      // Handballs slightly affected by wet (ball harder to grip)
      return isWet ? -0.02 : 0;
    case "T":
    case "HO":
    default:
      return 0;
  }
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
  signals:       IntelligenceSignals;
}

function buildProfiles(
  gamesByGame:   AFLGamePlayerStats[][],
  gameMeta:      AFLGameMeta[],
  /** Opponent's last N games — used to compute how much they concede per stat */
  opponentGames: AFLGamePlayerStats[][],
  teamId:        string,
  opponentId:    string,
  side:          "home" | "away",
  teamAbbr:      string,
  currentVenue:  string,
  restDays:      number,
  weather:       { condition: string; windKph: number } | null | undefined,
  injuries:      { playerName: string; status: string }[],
): Profile[] {
  const STATS: AFLPickStat[] = ["D", "G", "M", "T", "HO", "K", "H"];

  // Build per-player, per-stat: ordered vals AND a gameIndex→value map for venue lookup
  const playerVals     = new Map<string, Record<AFLPickStat, number[]>>();
  const playerGameVals = new Map<string, Record<AFLPickStat, Map<number, number>>>();

  gamesByGame.forEach((game, gameIdx) => {
    for (const p of game) {
      if (p.teamId !== teamId) continue;
      if (!playerVals.has(p.name)) {
        playerVals.set(p.name,     { D: [], G: [], M: [], T: [], HO: [], K: [], H: [] });
        playerGameVals.set(p.name, {
          D:  new Map(), G: new Map(), M:  new Map(),
          T:  new Map(), HO: new Map(), K: new Map(), H: new Map(),
        });
      }
      const v  = playerVals.get(p.name)!;
      const gv = playerGameVals.get(p.name)!;
      for (const s of STATS) {
        const val = p[s] ?? 0;
        v[s].push(val);
        gv[s].set(gameIdx, val);
      }
    }
  });

  // Pre-compute opponent rank signal for each stat (team-level, not player-level).
  // Uses the opponent's recent games to determine their defensive concession rate,
  // compared to our team's typical output — fires reliably every game.
  const oppRankByStatCache = new Map<AFLPickStat, number>();
  for (const stat of STATS) {
    oppRankByStatCache.set(
      stat,
      computeOpponentRankBoost(gamesByGame, opponentGames, teamId, opponentId, stat),
    );
  }

  // Rest days penalty: <6 days is a short turnaround
  const restDaysPenalty = restDays > 0 && restDays < 6 ? -0.05 : 0;

  // Venue indices: which game indices were played at the current venue
  const venueIndices = gameMeta
    .map((m, i) => (m.venueName && currentVenue && m.venueName === currentVenue ? i : -1))
    .filter(i => i >= 0);

  // Injury uplift: pre-compute who benefits when key players are absent
  const injuryUpliftMap = computeInjuryUpliftMap(gamesByGame, teamId, injuries);

  // Players confirmed out — exclude from slip selection entirely
  const outStatuses = /out|suspended|injured/i;
  const excludedPlayers = new Set(
    injuries.filter(i => outStatuses.test(i.status)).map(i => i.playerName.toLowerCase())
  );

  const profiles: Profile[] = [];

  for (const [name, statMap] of Array.from(playerVals.entries())) {
    if (excludedPlayers.has(name.toLowerCase())) continue;
    const gameValMap = playerGameVals.get(name)!;
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

      // ── Venue history signal ────────────────────────────────────────────────
      let venueBoost = 0;
      if (venueIndices.length >= 3) {
        const venueVals = venueIndices
          .map(i => gameValMap[stat].get(i))
          .filter((v): v is number => v !== undefined);
        if (venueVals.length >= 3 && avg > 0) {
          const ratio = mean(venueVals) / avg;
          venueBoost = Math.max(-0.08, Math.min(0.08, (ratio - 1.0) * 0.4));
        }
      }

      const signals: IntelligenceSignals = {
        restDaysPenalty,
        venueBoost,
        opponentRankBoost: oppRankByStatCache.get(stat) ?? 0,
        weatherPenalty:    computeWeatherPenalty(stat, weather),
        injuryUplift:      injuryUpliftMap.get(name)?.get(stat) ?? 0,
      };

      profiles.push({
        name, side, teamAbbr, stat, vals, avg,
        recentAvg, isOnForm, isBounceBack, gamesAnalyzed: vals.length,
        signals,
      });
    }
  }

  return profiles;
}

// ─── Peter Logic builder ───────────────────────────────────────────────────────

/**
 * Construct a single KitchenLeg from a profile at a given threshold/hitRate,
 * attaching estimated odds + bounce-back metadata. Used by the Peter and
 * disposals-Peter builders.
 */
function makePeterLeg(
  p: Profile,
  threshold: number,
  hitRate: number,
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  flags: { isValue: boolean; isBounceBack: boolean },
): KitchenLeg {
  const breakdown = computeReliability({ vals: p.vals, threshold, config: AFL_CONFIG });
  const signalTotal =
    p.signals.restDaysPenalty + p.signals.venueBoost +
    p.signals.opponentRankBoost + p.signals.weatherPenalty + p.signals.injuryUplift;
  const reliability = Math.max(0, Math.min(1.0, breakdown.finalReliability + signalTotal));

  const bb = detectBounceBack(p.vals, p.avg);
  const prop = findBestProp(propOdds, p.name, p.stat, threshold);

  return {
    player:         p.name,
    side:           p.side,
    teamAbbr:       p.teamAbbr,
    stat:           p.stat,
    statLabel:      STAT_LABELS[p.stat],
    threshold,
    hitRate,
    reliability,
    breakdown:      { ...breakdown, finalReliability: reliability },
    avgStat:        Math.round(p.avg * 10) / 10,
    gamesAnalyzed:  p.gamesAnalyzed,
    isBounceBack:   flags.isBounceBack || p.isBounceBack,
    isOnForm:       p.isOnForm,
    prop,
    signalTotal:    Math.round(signalTotal * 100) / 100,
    estimatedOdds:  estimateLegOdds(hitRate),
    lastGameStat:   bb.lastGameStat ?? undefined,
    bounceBackEdge: Math.round(bb.bounceBackEdge * 100) / 100,
    isValue:        flags.isValue,
  };
}

/**
 * Peter Logic slip builder.
 *
 * Every leg must clear a high historical hit rate (default 85%). Candidates are
 * scored, sorted, and greedily added until the estimated combined SGM odds reach
 * the target (≥2.0). Bounce-back value legs are weighted up and can be added even
 * after the target is met. Hard cap of `maxLegs` legs. No padding with weak legs.
 *
 * If no candidate clears 85% the slip is empty (no fake data).
 *
 * @param statsFilter  restrict to specific stats (used by the disposals slip)
 */
function buildPeterSlip(
  all: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  opts: {
    primaryHitRate: number;   // 0.85
    fallbackHitRate: number;  // 0.80 — only used if target unreachable
    targetOdds: number;       // 2.0
    maxLegs: number;          // 10
    statsFilter?: AFLPickStat[];
  },
): KitchenLeg[] {
  type Cand = {
    profile:   Profile;
    threshold: number;
    hitRate:   number;
    score:     number;
    isValue:   boolean;
    isBounce:  boolean;
    isFallback: boolean;
  };

  const buildCandidates = (targetHR: number, isFallback: boolean): Cand[] => {
    const out: Cand[] = [];
    for (const p of all) {
      if (opts.statsFilter && !opts.statsFilter.includes(p.stat)) continue;
      if (p.vals.length < 5) continue; // never invent — need real history

      const found = findPercentileThreshold(p.vals, targetHR, p.stat);
      if (!found) continue;

      const bb = detectBounceBack(p.vals, p.avg);
      const weakOpponent = (p.signals.opponentRankBoost ?? 0) > 0.02;

      const score =
        found.hitRate +
        (bb.isBounceBack ? 0.05 : 0) +     // bounce-back value bonus
        ((p.signals.venueBoost ?? 0) > 0 ? 0.03 : 0) + // home-ground/venue-history bonus
        (p.isOnForm ? 0.02 : 0) +          // on-form bonus
        (weakOpponent ? 0.02 : 0);         // weak-opponent bonus

      out.push({
        profile: p, threshold: found.threshold, hitRate: found.hitRate,
        score, isValue: bb.isBounceBack, isBounce: bb.isBounceBack, isFallback,
      });
    }
    return out;
  };

  // Primary pass at the non-negotiable 85% bar.
  const candidates = buildCandidates(opts.primaryHitRate, false);
  candidates.sort((a, b) => b.score - a.score);

  // Greedy build toward target odds.
  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();
  let targetReached = false;

  const tryAdd = (c: Cand): boolean => {
    if (selected.length >= opts.maxLegs) return false;
    const used = playerCount.get(c.profile.name) ?? 0;
    if (used >= 2) return false; // max 2 stats per player
    const leg = makePeterLeg(c.profile, c.threshold, c.hitRate, propOdds, {
      isValue: c.isValue, isBounceBack: c.isBounce,
    });
    selected.push(leg);
    playerCount.set(c.profile.name, used + 1);
    return true;
  };

  const combinedOdds = () => estimateSGMOdds(selected.map(l => ({ hitRate: l.hitRate })));

  const ODDS_CEILING = 10.0; // never let a Peter slip drift past ~10× estimated

  for (const c of candidates) {
    if (selected.length >= opts.maxLegs) break;
    if (targetReached) {
      // Target already met — only keep adding genuine bounce-back value legs,
      // and stop entirely once we'd push estimated odds past the 10× ceiling.
      if (!c.isValue) continue;
      const trial = estimateSGMOdds(
        [...selected.map(l => ({ hitRate: l.hitRate })), { hitRate: c.hitRate }],
      );
      if (trial > ODDS_CEILING) break;
    }
    if (tryAdd(c) && combinedOdds() >= opts.targetOdds) {
      targetReached = true;
    }
  }

  // If still under target after exhausting all 85% candidates, lower the bar to
  // the fallback hit rate (flagged) and add more until target is met.
  if (!targetReached && selected.length < opts.maxLegs) {
    const usedKeys = new Set(selected.map(l => `${l.player}|${l.stat}|${l.threshold}`));
    const fallback = buildCandidates(opts.fallbackHitRate, true)
      .filter(c => !usedKeys.has(`${c.profile.name}|${c.profile.stat}|${c.threshold}`))
      .sort((a, b) => b.score - a.score);
    for (const c of fallback) {
      if (selected.length >= opts.maxLegs) break;
      if (tryAdd(c) && combinedOdds() >= opts.targetOdds) break;
    }
  }

  return selected;
}

// ─── Hit-rate-band slip builders (safe / doable) ───────────────────────────────

/**
 * Build a slip from legs whose last-10-game hit rate falls in [minHR, maxHR].
 *
 * For each profile we find the HIGHEST threshold that still clears `minHR`, then
 * keep it only if that threshold's hit rate also satisfies `maxHR` (so "doable"
 * can exclude near-certainties that belong in "safe"). Candidates are sorted by
 * hit rate desc and greedily added until the estimated combined SGM odds reach
 * `minCombinedOdds`, capped at `maxLegs`. Same player max twice (different stats).
 *
 * Never invents data: a profile with < 5 recent games or no qualifying line is
 * skipped entirely.
 */
function buildHitRateBandSlip(
  all: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  opts: {
    minHR: number;
    maxHR: number;
    minCombinedOdds: number;
    maxLegs: number;
    statsFilter?: AFLPickStat[];
  },
): KitchenLeg[] {
  type Cand = { profile: Profile; threshold: number; hitRate: number };
  const cands: Cand[] = [];

  for (const p of all) {
    if (opts.statsFilter && !opts.statsFilter.includes(p.stat)) continue;
    const found = findThresholdAtHitRate(p.vals, opts.minHR, p.stat);
    if (!found) continue;
    if (found.hitRate > opts.maxHR) continue; // too certain for this band
    cands.push({ profile: p, threshold: found.threshold, hitRate: found.hitRate });
  }

  cands.sort((a, b) => b.hitRate - a.hitRate);

  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const c of cands) {
    if (selected.length >= opts.maxLegs) break;
    const used = playerCount.get(c.profile.name) ?? 0;
    if (used >= 2) continue;

    const bb = detectBounceBack(c.profile.vals, c.profile.avg);
    selected.push(makePeterLeg(c.profile, c.threshold, c.hitRate, propOdds, {
      isValue: bb.isBounceBack, isBounceBack: bb.isBounceBack,
    }));
    playerCount.set(c.profile.name, used + 1);

    const combined = estimateSGMOdds(selected.map(l => ({ hitRate: l.hitRate })));
    if (combined >= opts.minCombinedOdds) break;
  }

  return selected;
}

// ─── Ballsy slip builder ───────────────────────────────────────────────────────

/**
 * Build the Ballsy slip. Max 4 legs, target 4–8× estimated odds, never > 10×.
 *
 * Each leg must be EITHER:
 *   (a) an on-form player (last 3 avg ≥ 110% season avg) with the threshold set
 *       AT the player's season average (not below — that's where the bite is), OR
 *   (b) a "time to shine" pick — the player has trended up 3 straight games,
 *       with the threshold at their season average.
 *
 * We require a non-trivial hit rate (≥ 0.40) at the season-avg line so the leg
 * isn't a pure coin flip, then sort by hit rate desc and greedily build until
 * estimated combined odds enter the 4–8× window, hard-capped at 10×.
 */
function buildBallsySlip(
  all: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
): KitchenLeg[] {
  type Cand = { profile: Profile; threshold: number; hitRate: number };
  const cands: Cand[] = [];

  for (const p of all) {
    const qualifies = p.isOnForm || isTrendingUp(p.vals);
    if (!qualifies) continue;

    // Threshold AT season average, snapped to the stat's step grid.
    const step = STEP[p.stat];
    const thr = p.stat === "G"
      ? Math.max(step, Math.round(p.avg * 2) / 2)
      : Math.max(step, Math.round(p.avg));

    const hr = calcHitRate(p.vals.slice(-10), thr);
    if (hr < 0.40) continue; // must still be plausible, not a wild stab

    cands.push({ profile: p, threshold: thr, hitRate: hr });
  }

  cands.sort((a, b) => b.hitRate - a.hitRate);

  const MAX_LEGS = 4;
  const TARGET_MIN = 4.0;
  const HARD_CAP = 10.0;

  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const c of cands) {
    if (selected.length >= MAX_LEGS) break;
    const used = playerCount.get(c.profile.name) ?? 0;
    if (used >= 2) continue;

    // Would adding this leg blow past the 10× hard cap? If so, skip it.
    const trial = estimateSGMOdds([...selected, c].map(l => ({ hitRate: l.hitRate })));
    if (trial > HARD_CAP) continue;

    const bb = detectBounceBack(c.profile.vals, c.profile.avg);
    selected.push(makePeterLeg(c.profile, c.threshold, c.hitRate, propOdds, {
      isValue: false, isBounceBack: bb.isBounceBack,
    }));
    playerCount.set(c.profile.name, used + 1);

    const combined = estimateSGMOdds(selected.map(l => ({ hitRate: l.hitRate })));
    if (combined >= TARGET_MIN) break;
  }

  return selected;
}

// ─── Goal-scorers slip builder ─────────────────────────────────────────────────

/**
 * Build the Goal Scorers slip. Only players who have scored in 3+ of their last
 * 5 games. The bet is "to score a goal" (≥ 1 goal). Max 4 legs, sorted by goal
 * frequency desc (most reliable scorers first).
 *
 * The displayed hit rate is the player's actual rate of scoring ≥ 1 goal across
 * their last 10 games — real data, never invented.
 */
function buildGoalScorersSlip(
  all: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
): KitchenLeg[] {
  type Cand = { profile: Profile; hitRate: number; recentFreq: number };
  const cands: Cand[] = [];
  const seen = new Set<string>();

  for (const p of all) {
    if (p.stat !== "G") continue;
    if (seen.has(p.name)) continue;

    const recentFreq = goalsInLast(p.vals, 5); // games scored in, last 5
    if (recentFreq < 3) continue;              // must be a genuine scorer right now

    const hitRate = calcHitRate(p.vals.slice(-10), 1); // rate of scoring ≥ 1 goal
    if (hitRate < 0.60) continue;              // spec floor for goal legs

    seen.add(p.name);
    cands.push({ profile: p, hitRate, recentFreq });
  }

  // Sort by recent goal frequency desc, then by 10-game hit rate.
  cands.sort((a, b) => (b.recentFreq - a.recentFreq) || (b.hitRate - a.hitRate));

  const selected: KitchenLeg[] = [];
  for (const c of cands) {
    if (selected.length >= 4) break;
    selected.push(makePeterLeg(c.profile, 1, c.hitRate, propOdds, {
      isValue: false, isBounceBack: false,
    }));
  }

  return selected;
}

// ─── Value (bounce-back) slip builder ──────────────────────────────────────────

/**
 * Build the Value slip from bounce-back situations.
 *
 * Criteria per leg:
 *   - last game's stat < 65% of season average (a dip the book is likely to chase
 *     down with a lower or equal line), AND
 *   - season average still strong (≥ MIN_AVG for the stat), AND
 *   - season hit rate at the threshold ≥ 0.70.
 *
 * Threshold: highest line clearing 0.70 over the last 10 games. Sorted by
 * "edge" = (seasonAvg − lastGameStat) / seasonAvg desc (bigger dip = more value).
 * Max 5 legs, max 2 stats per player.
 */
function buildBounceBackValueSlip(
  all: Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
): KitchenLeg[] {
  type Cand = {
    profile: Profile; threshold: number; hitRate: number;
    edge: number; lastGameStat: number;
  };
  const cands: Cand[] = [];

  for (const p of all) {
    if (p.avg < MIN_AVG[p.stat]) continue;

    const lastGame = p.vals[p.vals.length - 1] ?? 0;
    if (!(lastGame < p.avg * 0.65)) continue; // must be a real dip last game

    const found = findThresholdAtHitRate(p.vals, 0.70, p.stat);
    if (!found) continue;

    const edge = p.avg > 0 ? (p.avg - lastGame) / p.avg : 0;
    cands.push({
      profile: p, threshold: found.threshold, hitRate: found.hitRate,
      edge, lastGameStat: lastGame,
    });
  }

  // Bigger drop relative to season avg = more value.
  cands.sort((a, b) => b.edge - a.edge);

  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const c of cands) {
    if (selected.length >= 5) break;
    const used = playerCount.get(c.profile.name) ?? 0;
    if (used >= 2) continue;

    const leg = makePeterLeg(c.profile, c.threshold, c.hitRate, propOdds, {
      isValue: true, isBounceBack: true,
    });
    // Surface the value edge (avg over the book/threshold) for the UI.
    leg.edge = Math.round((c.profile.avg - c.threshold) * 10) / 10;
    selected.push(leg);
    playerCount.set(c.profile.name, used + 1);
  }

  return selected;
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
  // ── Intelligence signals (all optional — degrade gracefully if absent) ──
  /** Per-game context for home team's recent history */
  homeGameMeta?:   AFLGameMeta[];
  /** Per-game context for away team's recent history */
  awayGameMeta?:   AFLGameMeta[];
  /** Venue name for today's game (e.g. "Melbourne Cricket Ground") */
  currentVenue?:   string;
  /** Weather at game time */
  weather?:        { condition: string; windKph: number } | null;
  /** Days since home team's last game (0 = unknown) */
  homeRestDays?:   number;
  /** Days since away team's last game (0 = unknown) */
  awayRestDays?:   number;
  /** Home team injury list — used for injury uplift signal */
  homeInjuries?:   { playerName: string; status: string }[];
  /** Away team injury list — used for injury uplift signal */
  awayInjuries?:   { playerName: string; status: string }[];
}): { slips: KitchenSlip[]; buildBookieSlips: (bookie: BookieConfig) => KitchenSlip[] } {
  const {
    homeGames, awayGames, homeTeamId, awayTeamId, homeAbbr, awayAbbr, propOdds,
    homeGameMeta = [], awayGameMeta = [],
    currentVenue = "", weather = null,
    homeRestDays = 0, awayRestDays = 0,
    homeInjuries = [], awayInjuries = [],
  } = params;

  const homeProfiles = buildProfiles(
    homeGames, homeGameMeta, awayGames,   // awayGames = opponent's recent games (for defensive rank)
    homeTeamId, awayTeamId,
    "home", homeAbbr, currentVenue, homeRestDays, weather, homeInjuries,
  );
  const awayProfiles = buildProfiles(
    awayGames, awayGameMeta, homeGames,   // homeGames = opponent's recent games (for defensive rank)
    awayTeamId, homeTeamId,
    "away", awayAbbr, currentVenue, awayRestDays, weather, awayInjuries,
  );
  const all = [...homeProfiles, ...awayProfiles];

  // ── 0. Peter ──────────────────────────────────────────────────────────────
  // Every leg ≥ 85% hit rate (last 10g). Greedy build to ≥ 2.0× estimated odds,
  // keep adding genuine value legs up to a 10× ceiling. Value-weighted scoring.
  const peterLegs = buildPeterSlip(all, propOdds, {
    primaryHitRate:  0.85,
    fallbackHitRate: 0.85, // peter never relaxes below 85% — no padding
    targetOdds:      2.0,
    maxLegs:         8,
  });

  // ── 1. Safe ───────────────────────────────────────────────────────────────
  // Live-odds path first: when real Sportsbet lines exist, use them so prices on
  // the All Markets tab are exact. Otherwise build from the ≥ 0.80 hit-rate band.
  const safeFromProps = buildPropsBasedSafeSlip(all, propOdds, 1.80, 2, 6);
  const safeLegs = safeFromProps.length >= 2
    ? safeFromProps
    : buildHitRateBandSlip(all, propOdds, {
        minHR: 0.80, maxHR: 1.00, minCombinedOdds: 1.80, maxLegs: 6,
      });

  // ── 2. Doable ─────────────────────────────────────────────────────────────
  // Hit rate 0.70–0.79 (last 10g). Max 5 legs. Min 2.5× estimated combined odds.
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableLegs = buildHitRateBandSlip(all, propOdds, {
    minHR: 0.70, maxHR: 0.79, minCombinedOdds: 2.5, maxLegs: 5,
  }).filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`));

  // ── 3. Goal Scorers ───────────────────────────────────────────────────────
  // Players who scored in 3+ of last 5. "To score a goal" (≥1). Max 4 legs.
  const goalLegs = buildGoalScorersSlip(all, propOdds);

  // ── 4. Disposals ──────────────────────────────────────────────────────────
  // Pure disposals SGM. Peter logic restricted to D: ≥ 85% per leg, build to 2.0×.
  const disposalLegs = buildPeterSlip(all, propOdds, {
    primaryHitRate:  0.85,
    fallbackHitRate: 0.85,
    targetOdds:      2.0,
    maxLegs:         8,
    statsFilter:     ["D"],
  });

  // ── 5. Ballsy ─────────────────────────────────────────────────────────────
  // On-form / trending-up players at season-avg lines. 4–8× odds, never > 10×.
  const ballsyLegs = buildBallsySlip(all, propOdds);

  // ── 6. Value Picks ────────────────────────────────────────────────────────
  // Bounce-back value: last game dipped < 65% of avg, season avg still strong.
  const valueLegs = buildBounceBackValueSlip(all, propOdds);

  const withOdds = (type: KitchenSlipType, legs: KitchenLeg[]): KitchenSlip => {
    const estimatedOdds = estimateSGMOdds(legs.map(l => ({ hitRate: l.hitRate })));
    return { type, legs, estimatedOdds, estimatedCombinedOdds: estimatedOdds };
  };

  const slips: KitchenSlip[] = [
    withOdds("peter",       peterLegs),
    withOdds("safe",        safeLegs),
    withOdds("doable",      doableLegs),
    withOdds("goalscorers", goalLegs),
    withOdds("disposals",   disposalLegs),
    withOdds("ballsy",      ballsyLegs),
    withOdds("value",       valueLegs),
  ];

  return {
    slips,
    buildBookieSlips: (bookie: BookieConfig) =>
      computeBookieSlipsFromProfiles(all, propOdds, bookie),
  };
}

// ─── Per-slip odds targets ────────────────────────────────────────────────────

/**
 * Minimum combined odds, minimum legs, and maximum legs per slip type.
 * Combined odds use leg.prop.price when available (real market price),
 * falling back to 1/hitRate (fair value) when prop odds are absent.
 */
const SLIP_TARGETS: Record<KitchenSlipType, { minOdds: number; maxOdds: number; minLegs: number; maxLegs: number }> = {
  peter:       { minOdds: 2.0,  maxOdds: 10.0,     minLegs: 2, maxLegs: 8 },
  safe:        { minOdds: 1.8,  maxOdds: 3.0,      minLegs: 2, maxLegs: 6 },
  doable:      { minOdds: 3.0,  maxOdds: 8.0,      minLegs: 2, maxLegs: 5 },
  goalscorers: { minOdds: 3.0,  maxOdds: 9.0,      minLegs: 2, maxLegs: 5 },
  disposals:   { minOdds: 3.0,  maxOdds: 8.0,      minLegs: 2, maxLegs: 5 },
  ballsy:      { minOdds: 4.0,  maxOdds: 10.0,     minLegs: 2, maxLegs: 4 },
  value:       { minOdds: 2.0,  maxOdds: Infinity, minLegs: 2, maxLegs: 5 },
};

/**
 * Pick legs from a candidate pool until combined odds ≥ minOdds.
 *
 * Uses leg.prop.price when available (real market price from The Odds API),
 * falling back to 1/hitRate (fair value) when no prop price is attached.
 *
 * Sorts by reliability desc (most confident first) before picking.
 * Respects minLegs / maxLegs. If combined odds can't be reached within maxLegs,
 * returns the best available set up to maxLegs.
 */
export function enforceOddsTarget(
  legs:     KitchenLeg[],
  minOdds:  number,
  maxOdds:  number,
  minLegs:  number,
  maxLegs:  number,
): KitchenLeg[] {
  if (legs.length === 0) return [];

  const legOdds = (l: KitchenLeg) => l.prop?.price ?? (1 / l.hitRate);

  // Sort by reliability descending (most confident first)
  const sorted = [...legs].sort((a, b) => b.reliability - a.reliability);
  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const leg of sorted) {
    if (selected.length >= maxLegs) break;
    const used = playerCount.get(leg.player) ?? 0;
    if (used >= 2) continue; // max 2 legs per player (different stats)

    // Skip legs that would push combined odds above maxOdds
    if (maxOdds !== Infinity) {
      const trial = [...selected, leg].reduce((acc, l) => acc * legOdds(l), 1);
      if (trial > maxOdds) continue;
    }

    selected.push(leg);
    playerCount.set(leg.player, used + 1);

    const combinedOdds = selected.reduce((acc, l) => acc * legOdds(l), 1);
    if (selected.length >= minLegs && combinedOdds >= minOdds) break;
  }

  // Must have at least minLegs — otherwise there's not enough signal for a slip
  if (selected.length < minLegs) return [];
  return selected;
}

// ─── Bookie-specific kitchen ──────────────────────────────────────────────────

import { snapThreshold, goalLabel, type BookieConfig } from "./bookies";

/**
 * Build a pool of legs for a specific bookie by using that bookie's actual
 * valid lines as thresholds (instead of the generic fraction-of-average approach).
 *
 * For each profile, iterates the bookie's valid lines HIGH to LOW and picks
 * the first (highest) line whose hit rate falls within [minFlatHR, maxFlatHR].
 * This ensures thresholds always correspond to real bookie markets.
 *
 * requireBelowAvg: for value-type legs — only consider lines below the player's average.
 */
function buildLegsForBookie(
  profiles:  Profile[],
  bookie:    BookieConfig,
  propOdds:  Map<string, { price: number; line: number; bookmaker: string }>,
  tier: {
    minFlatHR:       number;
    maxFlatHR:       number;
    statsFilter?:    AFLPickStat[];
    maxLegs:         number;
    requireBelowAvg?: boolean;
  },
): KitchenLeg[] {
  type Candidate = { leg: KitchenLeg; reliability: number };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const p of profiles) {
    if (p.vals.length < 5) continue;
    if (tier.statsFilter && !tier.statsFilter.includes(p.stat)) continue;

    const statConfig = bookie.stats[p.stat];
    if (!statConfig?.available || statConfig.validLines.length === 0) continue;

    // Iterate lines HIGH to LOW — take the highest line that qualifies
    const lines = [...statConfig.validLines].sort((a, b) => b - a);

    let bestLine: { threshold: number; hitRate: number } | null = null;
    for (const line of lines) {
      if (tier.requireBelowAvg && line >= p.avg) continue;
      const hr = calcHitRate(p.vals, line);
      if (hr >= tier.minFlatHR && hr <= tier.maxFlatHR) {
        bestLine = { threshold: line, hitRate: hr };
        break;
      }
    }
    if (!bestLine) continue;

    const dedupKey = `${p.name}|${p.stat}|${bestLine.threshold}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const breakdown = computeReliability({ vals: p.vals, threshold: bestLine.threshold, config: AFL_CONFIG });
    const signalTotal =
      p.signals.restDaysPenalty + p.signals.venueBoost +
      p.signals.opponentRankBoost + p.signals.weatherPenalty + p.signals.injuryUplift;
    const reliability = Math.max(0, Math.min(1.0, breakdown.finalReliability + signalTotal));

    const prop = findBestProp(propOdds, p.name, p.stat, bestLine.threshold);
    const statLabel = p.stat === "G" ? goalLabel(bestLine.threshold) : STAT_LABELS[p.stat];
    const legSignalTotal = Math.round(signalTotal * 100) / 100;

    candidates.push({
      reliability,
      leg: {
        player:        p.name,
        side:          p.side,
        teamAbbr:      p.teamAbbr,
        stat:          p.stat,
        statLabel,
        threshold:     bestLine.threshold,
        hitRate:       bestLine.hitRate,
        reliability,
        breakdown:     { ...breakdown, finalReliability: reliability },
        avgStat:       Math.round(p.avg * 10) / 10,
        gamesAnalyzed: p.gamesAnalyzed,
        isBounceBack:  p.isBounceBack,
        isOnForm:      p.isOnForm,
        prop,
        signalTotal:   legSignalTotal,
      },
    });
  }

  candidates.sort((a, b) => b.reliability - a.reliability);

  const legs: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();
  for (const { leg } of candidates) {
    if (legs.length >= tier.maxLegs) break;
    const used = playerCount.get(leg.player) ?? 0;
    if (used >= 2) continue;
    legs.push(leg);
    playerCount.set(leg.player, used + 1);
  }

  return legs;
}

/**
 * Compute all 6 slip types for a specific bookie, using that bookie's valid
 * line ladders as thresholds instead of the generic fraction-of-average approach.
 *
 * This is the correct way to generate bookie-specific slips — each leg is
 * guaranteed to map to a real market line on that bookie.
 */
function computeBookieSlipsFromProfiles(
  all:      Profile[],
  propOdds: Map<string, { price: number; line: number; bookmaker: string }>,
  bookie:   BookieConfig,
): KitchenSlip[] {
  // Safe: bookie lines with hitRate >= 80%
  const safeLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.80, maxFlatHR: 1.00, maxLegs: 15 }),
    SLIP_TARGETS.safe.minOdds, SLIP_TARGETS.safe.maxOdds,
    SLIP_TARGETS.safe.minLegs, SLIP_TARGETS.safe.maxLegs,
  );

  // Doable: hitRate 68–100%, excluding any legs already in safe
  const safeKeys = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.68, maxFlatHR: 1.00, maxLegs: 10 })
      .filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`)),
    SLIP_TARGETS.doable.minOdds, SLIP_TARGETS.doable.maxOdds,
    SLIP_TARGETS.doable.minLegs, SLIP_TARGETS.doable.maxLegs,
  );

  // Goal Scorers: G only
  const goalLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.65, maxFlatHR: 1.00, statsFilter: ["G"], maxLegs: 8 }),
    SLIP_TARGETS.goalscorers.minOdds, SLIP_TARGETS.goalscorers.maxOdds,
    SLIP_TARGETS.goalscorers.minLegs, SLIP_TARGETS.goalscorers.maxLegs,
  );

  // Disposals: D only
  const disposalLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.72, maxFlatHR: 1.00, statsFilter: ["D"], maxLegs: 8 }),
    SLIP_TARGETS.disposals.minOdds, SLIP_TARGETS.disposals.maxOdds,
    SLIP_TARGETS.disposals.minLegs, SLIP_TARGETS.disposals.maxLegs,
  );

  // Ballsy: hitRate 25–60% — low probability, high upside
  const ballsyLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.25, maxFlatHR: 0.60, maxLegs: 14 }),
    SLIP_TARGETS.ballsy.minOdds, SLIP_TARGETS.ballsy.maxOdds,
    SLIP_TARGETS.ballsy.minLegs, SLIP_TARGETS.ballsy.maxLegs,
  );

  // Value: bookie lines that sit below the player's average (book is underpricing them)
  const valueLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.65, maxFlatHR: 1.00, maxLegs: 10, requireBelowAvg: true }),
    SLIP_TARGETS.value.minOdds, SLIP_TARGETS.value.maxOdds,
    SLIP_TARGETS.value.minLegs, SLIP_TARGETS.value.maxLegs,
  );

  // Peter: bookie lines, every leg ≥ 85% hit rate, build toward 2.0× estimate.
  const peterLegs = enforceOddsTarget(
    buildLegsForBookie(all, bookie, propOdds, { minFlatHR: 0.85, maxFlatHR: 1.00, maxLegs: 8 }),
    SLIP_TARGETS.peter.minOdds, SLIP_TARGETS.peter.maxOdds,
    SLIP_TARGETS.peter.minLegs, SLIP_TARGETS.peter.maxLegs,
  );

  const withOdds = (type: KitchenSlipType, legs: KitchenLeg[]): KitchenSlip => {
    const estimatedOdds = estimateSGMOdds(legs.map(l => ({ hitRate: l.hitRate })));
    return { type, legs, estimatedOdds, estimatedCombinedOdds: estimatedOdds };
  };

  return ([
    withOdds("peter",       peterLegs),
    withOdds("safe",        safeLegs),
    withOdds("doable",      doableLegs),
    withOdds("goalscorers", goalLegs),
    withOdds("disposals",   disposalLegs),
    withOdds("ballsy",      ballsyLegs),
    withOdds("value",       valueLegs),
  ] as KitchenSlip[]).filter(s => s.legs.length > 0);
}

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
        // For goals: update statLabel to bookie-friendly label (e.g. "Anytime")
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

    // After filtering and snapping to bookie lines, enforce the odds range
    // target for this slip type so every tab always has a meaningful slip.
    const target = SLIP_TARGETS[slip.type];
    const filteredLegs = enforceOddsTarget(
      Array.from(seen.values()),
      target.minOdds,
      target.maxOdds,
      target.minLegs,
      target.maxLegs,
    );

    const estimatedOdds = estimateSGMOdds(filteredLegs.map(l => ({ hitRate: l.hitRate })));
    return { ...slip, legs: filteredLegs, estimatedOdds, estimatedCombinedOdds: estimatedOdds };
  }).filter(slip => slip.legs.length > 0);
}
