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
}

export interface KitchenSlip {
  type: KitchenSlipType;
  legs: KitchenLeg[];
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

/**
 * Find the best matching Sportsbet prop for a player+stat combination.
 *
 * propOdds keys are "PlayerName|stat|line" — iterates all entries for this
 * player+stat and returns the one whose line is closest to targetThreshold.
 * Used by buildLegs to attach a relevant price for display on non-safe slips.
 */
function findBestProp(
  propOdds:        Map<string, { price: number; line: number; bookmaker: string }>,
  playerName:      string,
  stat:            AFLPickStat,
  targetThreshold: number,
): { price: number; line: number; bookmaker: string } | undefined {
  const prefix = `${playerName}|${stat}|`;
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
  // Quick profile lookup by "playerName|stat"
  const profileMap = new Map<string, Profile>();
  for (const p of all) profileMap.set(`${p.name}|${p.stat}`, p);

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
        player:        playerName,
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

  const profiles: Profile[] = [];

  for (const [name, statMap] of Array.from(playerVals.entries())) {
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

    // Apply intelligence signals
    const signalTotal =
      p.signals.restDaysPenalty +
      p.signals.venueBoost +
      p.signals.opponentRankBoost +
      p.signals.weatherPenalty +
      p.signals.injuryUplift;
    reliability = Math.max(0, Math.min(1.0, reliability + signalTotal));

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

    const prop = findBestProp(propOdds, p.name, p.stat, threshold);

    const legSignalTotal = Math.round(
      (p.signals.restDaysPenalty +
       p.signals.venueBoost +
       p.signals.opponentRankBoost +
       p.signals.weatherPenalty +
       p.signals.injuryUplift) * 100
    ) / 100;

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
      signalTotal:   legSignalTotal,
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

    // Value: find the prop line that is BELOW the player's average AND has best odds
    // (Sportsbet lines can vary per player — pick the one below avg with highest price)
    const prefix = `${p.name}|${p.stat}|`;
    let prop: { price: number; line: number; bookmaker: string } | undefined;
    for (const [k, v] of Array.from(propOdds.entries())) {
      if (!k.startsWith(prefix)) continue;
      if (v.line >= p.avg) continue;           // only lines below average = value
      if (v.price < 1.60) continue;            // minimum viable odds
      if (!prop || v.price > prop.price) prop = v; // highest price = best value
    }

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
}): KitchenSlip[] {
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

  // ── 1. Safe ───────────────────────────────────────────────────────────────
  // Two-pass approach so bookie tabs always have enough candidates:
  //   Pass A: exact Sportsbet market lines (accurate prices for All Markets tab)
  //   Pass B: buildLegs conservative pool (high hit rate, 80%+, threshold 50–75% avg)
  //           provides additional candidates that survive Bet365/Dabble filtering
  //           when the props-based pool is thin.
  // Both pools are merged (deduped by player|stat|threshold), then enforceOddsTarget
  // picks the best 2-5 legs for the All Markets tab display.
  const safeFromProps = buildPropsBasedSafeSlip(all, propOdds, 2.00, 2, 5);
  const safeFallback  = buildLegs(all, propOdds, {
    minFlatHR: 0.80, maxFlatHR: 1.00,
    minFraction: 0.50, maxFraction: 0.75,
    minReliability: 0.60, maxReliability: 1.00,
    maxLegs: 15, formBonus: 0,
  });
  // Merge: props-based first (has accurate Sportsbet prices), fallback fills the rest
  const safeSeen = new Set(safeFromProps.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const safePool = [
    ...safeFromProps,
    ...safeFallback.filter(l => !safeSeen.has(`${l.player}|${l.stat}|${l.threshold}`)),
  ];
  const safeLegs = enforceOddsTarget(safePool, SLIP_TARGETS.safe.minOdds, SLIP_TARGETS.safe.minLegs, SLIP_TARGETS.safe.maxLegs);

  // ── 2. Doable ─────────────────────────────────────────────────────────────
  // Threshold 75–90% of avg. Hit rate 68–80%. Reliable but a step harder.
  // Generate a large candidate pool (10), then enforce 3.0 combined odds target.
  const safeKeys   = new Set(safeLegs.map(l => `${l.player}|${l.stat}|${l.threshold}`));
  const doableRaw  = buildLegs(all, propOdds, {
    minFlatHR: 0.68, maxFlatHR: 1.00,
    minFraction: 0.75, maxFraction: 0.92,
    minReliability: 0.45, maxReliability: 1.00,
    maxLegs: 10, formBonus: 0,
  });
  const doableLegs = enforceOddsTarget(
    doableRaw.filter(l => !safeKeys.has(`${l.player}|${l.stat}|${l.threshold}`)),
    SLIP_TARGETS.doable.minOdds,
    SLIP_TARGETS.doable.minLegs,
    SLIP_TARGETS.doable.maxLegs,
  );

  // ── 3. Goal Scorers ───────────────────────────────────────────────────────
  // Goals only. Generate 8 candidates, enforce 3.0 combined odds target.
  const goalLegs = enforceOddsTarget(
    buildLegs(all, propOdds, {
      minFlatHR: 0.65, maxFlatHR: 1.00,
      minFraction: 0.40, maxFraction: 0.80,
      minReliability: 0.32, maxReliability: 1.00,
      maxLegs: 8, statsFilter: ["G"], formBonus: 0,
    }),
    SLIP_TARGETS.goalscorers.minOdds,
    SLIP_TARGETS.goalscorers.minLegs,
    SLIP_TARGETS.goalscorers.maxLegs,
  );

  // ── 4. Disposals ──────────────────────────────────────────────────────────
  // Disposals only. Generate 8 candidates, enforce 3.0 combined odds target.
  const disposalLegs = enforceOddsTarget(
    buildLegs(all, propOdds, {
      minFlatHR: 0.72, maxFlatHR: 1.00,
      minFraction: 0.55, maxFraction: 0.85,
      minReliability: 0.42, maxReliability: 1.00,
      maxLegs: 8, statsFilter: ["D"], formBonus: 0,
    }),
    SLIP_TARGETS.disposals.minOdds,
    SLIP_TARGETS.disposals.minLegs,
    SLIP_TARGETS.disposals.maxLegs,
  );

  // ── 5. Ballsy ─────────────────────────────────────────────────────────────
  // On-form players first (threshold above recent avg), then regular bold picks.
  // Generates up to 10 candidates, enforces 10.0 combined odds, 5–7 legs.
  const onFormProfiles = all.filter(p => p.isOnForm);
  const ballsyOnForm   = buildLegs(onFormProfiles, propOdds, {
    minFlatHR: 0.25, maxFlatHR: 0.60,
    minFraction: 1.10, maxFraction: 1.60,
    minReliability: 0.10, maxReliability: 0.55,
    maxLegs: 7, formBonus: 0.05, useRecentBase: true,
  });
  const ballsyRegular = buildLegs(all, propOdds, {
    minFlatHR: 0.30, maxFlatHR: 0.60,
    minFraction: 0.95, maxFraction: 1.50,
    minReliability: 0.10, maxReliability: 0.52,
    maxLegs: 7, formBonus: 0,
  });
  // Merge: on-form first, then regular, deduplicated, up to 14 candidates
  const ballsySeen    = new Set<string>();
  const ballsyPool: KitchenLeg[] = [];
  for (const leg of [...ballsyOnForm, ...ballsyRegular]) {
    const key = `${leg.player}|${leg.stat}|${leg.threshold}`;
    if (ballsySeen.has(key)) continue;
    ballsySeen.add(key);
    ballsyPool.push(leg);
    if (ballsyPool.length >= 14) break;
  }
  const ballsyLegs = enforceOddsTarget(
    ballsyPool,
    SLIP_TARGETS.ballsy.minOdds,
    SLIP_TARGETS.ballsy.minLegs,
    SLIP_TARGETS.ballsy.maxLegs,
  );

  // ── 6. Value Picks ────────────────────────────────────────────────────────
  // Book line < player average. Enforce 2.0 combined odds minimum.
  const valueLegs = enforceOddsTarget(
    buildValueLegs(all, propOdds),
    SLIP_TARGETS.value.minOdds,
    SLIP_TARGETS.value.minLegs,
    SLIP_TARGETS.value.maxLegs,
  );

  return [
    { type: "safe",        legs: safeLegs },
    { type: "doable",      legs: doableLegs },
    { type: "goalscorers", legs: goalLegs },
    { type: "disposals",   legs: disposalLegs },
    { type: "ballsy",      legs: ballsyLegs },
    { type: "value",       legs: valueLegs },
  ];
}

// ─── Per-slip odds targets ────────────────────────────────────────────────────

/**
 * Minimum combined odds, minimum legs, and maximum legs per slip type.
 * Combined odds are computed using 1/hitRate (fair value) for each leg —
 * independent of whether a prop price is attached, to avoid mismatched lines.
 */
const SLIP_TARGETS: Record<KitchenSlipType, { minOdds: number; minLegs: number; maxLegs: number }> = {
  safe:        { minOdds: 2.0,  minLegs: 2, maxLegs: 5 },
  doable:      { minOdds: 3.0,  minLegs: 2, maxLegs: 5 },
  goalscorers: { minOdds: 3.0,  minLegs: 2, maxLegs: 5 },
  disposals:   { minOdds: 3.0,  minLegs: 2, maxLegs: 5 },
  ballsy:      { minOdds: 10.0, minLegs: 5, maxLegs: 7 },
  value:       { minOdds: 2.0,  minLegs: 2, maxLegs: 5 },
};

/**
 * Pick legs from a candidate pool until combined fair-value odds ≥ minOdds.
 *
 * Uses 1/hitRate as the per-leg fair value — consistent regardless of whether
 * a real prop price exists and immune to mismatched Sportsbet/bookie lines.
 *
 * Sorts by reliability desc (most confident first) before picking.
 * Respects minLegs / maxLegs. If combined odds can't be reached within maxLegs,
 * returns the best available set up to maxLegs.
 */
export function enforceOddsTarget(
  legs:     KitchenLeg[],
  minOdds:  number,
  minLegs:  number,
  maxLegs:  number,
): KitchenLeg[] {
  if (legs.length === 0) return [];

  // Sort by reliability descending (most confident first)
  const sorted = [...legs].sort((a, b) => b.reliability - a.reliability);
  const selected: KitchenLeg[] = [];
  const playerCount = new Map<string, number>();

  for (const leg of sorted) {
    if (selected.length >= maxLegs) break;
    const used = playerCount.get(leg.player) ?? 0;
    if (used >= 2) continue; // max 2 legs per player (different stats)

    selected.push(leg);
    playerCount.set(leg.player, used + 1);

    const combinedOdds = selected.reduce((acc, l) => acc * (1 / l.hitRate), 1);
    if (selected.length >= minLegs && combinedOdds >= minOdds) break;
  }

  return selected;
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

    // After filtering and snapping to bookie lines, enforce the minimum odds
    // target for this slip type so every tab always has a meaningful slip.
    const target = SLIP_TARGETS[slip.type];
    const filteredLegs = enforceOddsTarget(
      Array.from(seen.values()),
      target.minOdds,
      target.minLegs,
      target.maxLegs,
    );

    return { ...slip, legs: filteredLegs };
  }).filter(slip => slip.legs.length > 0);
}
