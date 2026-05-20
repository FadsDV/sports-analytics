import type { TeamHistoryGame } from "@/lib/sports/espn";
import type { SofascoreGameLog, SofascoreTeamStats } from "@/lib/sports/sofascore";
import { computeReliability, SOCCER_CONFIG } from "@/lib/sports/reliability/engine";
import type { ReliabilityBreakdown } from "@/lib/sports/reliability/types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type SoccerStatKey =
  | "scoreOrAssist" | "goals" | "assists"
  | "shots" | "shotsOnTarget" | "tackles"
  | "yellowCards" | "foulsCommitted" | "saves"
  | "xG";

export type SoccerLegType = "player" | "team" | "match";

export type SoccerSlipType =
  | "safe" | "doable" | "goalscorers" | "shots" | "cards" | "value";

export interface SoccerKitchenLeg {
  legType:       SoccerLegType;
  // Player legs
  player?:       string;
  shortName?:    string;
  side?:         "home" | "away";
  teamAbbr?:     string;
  // Team/match legs
  teamName?:     string;
  // Common
  stat:          SoccerStatKey | "teamGoals" | "matchGoals" | "btts" | "totalCards" | "corners" | "totalShots";
  statLabel:     string;           // exact bookmaker market name
  threshold:     number;
  direction:     "over" | "under";
  hitRate:       number;
  reliability:   number;
  avgStat:       number;
  gamesAnalyzed: number;
  breakdown:     ReliabilityBreakdown;
  isOnForm:      boolean;
  isBounceBack:  boolean;
  edge?:         number;
  signalTotal?:  number;
  prop?:         SoccerProp;
}

export interface SoccerKitchenSlip {
  type: SoccerSlipType;
  legs: SoccerKitchenLeg[];
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface SoccerPlayerProfile {
  sofaId:    number;
  name:      string;
  shortName: string;
  position:  string;
  side:      "home" | "away";
  teamAbbr:  string;
  teamName:  string;
  games:     SofascoreGameLog[];
}

export interface SoccerProp {
  price:     number;
  line:      number;
  bookmaker: string;
}

export interface SoccerKitchenInput {
  homeAbbr:      string;
  awayAbbr:      string;
  homeTeamName:  string;
  awayTeamName:  string;
  homeHistory:   TeamHistoryGame[];
  awayHistory:   TeamHistoryGame[];
  homeTeamStats: SofascoreTeamStats | null;
  awayTeamStats: SofascoreTeamStats | null;
  players:       SoccerPlayerProfile[];
  weather?:      { condition: string; windKph: number } | null;
  homeRestDays?: number;
  awayRestDays?: number;
  propOdds?:     Map<string, SoccerProp>;
}

// ─── Intelligence signals ─────────────────────────────────────────────────────

function computeOpponentRankBoost(
  myAvg: number,
  oppConcededAvg: number,
): number {
  if (myAvg <= 0 || oppConcededAvg <= 0) return 0;
  const ratio = oppConcededAvg / myAvg;
  // 20% above -> +0.10 boost, 20% below -> -0.10 penalty
  return Math.max(-0.10, Math.min(0.10, (ratio - 1.0) * 0.5));
}

function computeWeatherPenalty(
  stat: string,
  weather: { condition: string; windKph: number } | null | undefined,
): number {
  if (!weather) return 0;
  const isWet = ["Rain", "Storm"].includes(weather.condition);
  const wind  = weather.windKph;

  switch (stat) {
    case "goals":
    case "teamGoals":
    case "matchGoals":
    case "shots":
    case "shotsOnTarget":
      return (isWet ? -0.05 : 0) + (wind > 40 ? -0.03 : 0);
    case "corners":
      return (isWet ? -0.02 : 0);
    default:
      return 0;
  }
}

function computeRestDaysPenalty(restDays: number): number {
  if (restDays > 0 && restDays < 4) return -0.05;
  return 0;
}

/**
 * Usage concentration boost.
 *
 * If a player's team has fewer high-impact attacking teammates in the current
 * lineup, that player is likely to receive more touches and scoring chances.
 * Applies only to attacking stats (goals, assists, scoreOrAssist, shots, SOT).
 *
 * "High-impact" = teamate whose avg (goals + assists) across recent games >= 0.30.
 * - 0 such teammates: player is the sole creator → +0.05
 * - 1 such teammate: thin attack, sharing with one other → +0.02
 * - 2+ such teammates: normal competition, no adjustment
 */
function computeUsageBoost(
  player: SoccerPlayerProfile,
  allPlayers: SoccerPlayerProfile[],
  stat: string,
): number {
  if (!["goals", "assists", "scoreOrAssist", "shots", "shotsOnTarget"].includes(stat)) return 0;

  const teammates = allPlayers.filter(p => p.teamName === player.teamName && p.sofaId !== player.sofaId);
  if (teammates.length === 0) return 0;

  const highImpact = teammates.filter(t => {
    const soa = mean(t.games.map(g => (g.goals ?? 0) + (g.assists ?? 0)));
    return soa >= 0.30;
  });

  if (highImpact.length === 0) return 0.05;   // sole creator on the team
  if (highImpact.length === 1) return 0.02;   // thin attack — sharing with one other
  return 0;                                    // normal lineup — no adjustment
}

function computeRotationPenalty(games: SofascoreGameLog[]): number {
  const recent5 = games.slice(-5);
  if (recent5.length < 3) return 0;
  const subGames = recent5.filter(g => (g.minutesPlayed ?? 0) < 60).length;
  // If played < 60 mins in 3+ of last 5, apply penalty
  return subGames >= 3 ? -0.12 : 0;
}

function computeSetPieceBonus(player: SoccerPlayerProfile, stat: string): number {
  const avgKeyPasses = mean(player.games.map(g => g.keyPasses ?? 0).filter(v => v !== null));
  if (stat === "assists" || stat === "scoreOrAssist") {
    return avgKeyPasses >= 2.0 ? 0.08 : avgKeyPasses >= 1.2 ? 0.04 : 0;
  }
  return 0;
}

function computeVenueBoost(side: "home" | "away"): number {
  return side === "home" ? 0.04 : -0.02;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function hr(vals: number[], threshold: number): number {
  return vals.length ? vals.filter(v => v >= threshold).length / vals.length : 0;
}

function parseScore(score: string | null): [number, number] | null {
  if (!score) return null;
  const m = score.match(/(\d+)\D+(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2])] : null;
}

function snap(raw: number, step: number): number {
  return Math.round(raw / step) * step;
}

function snapToMarket(val: number, stat: string): number {
  if (stat === "goals" || stat === "assists" || stat === "scoreOrAssist" || stat === "yellowCards") {
    // bet365 ladders: 0.5, 1.5, 2.5
    return snap(val, 0.5);
  }
  if (stat === "shots" || stat === "shotsOnTarget" || stat === "tackles" || stat === "foulsCommitted") {
    // bet365 usually 1.0, 2.0, 3.0 etc for shots/tackles
    return snap(val, 1.0);
  }
  return snap(val, 0.5);
}

function findThreshold(
  vals: number[], avg: number, step: number,
  minHR: number, maxHR: number,
  minFrac: number, maxFrac: number,
): { threshold: number; hitRate: number } | null {
  const minThr = Math.max(step, snap(avg * minFrac, step));
  const maxThr = snap(avg * maxFrac, step);
  let best: { threshold: number; hitRate: number } | null = null;
  for (let t = minThr; t <= maxThr + step / 2; t += step) {
    const thr = snap(t, step);
    const h   = hr(vals, thr);
    if (h >= minHR && h <= maxHR) {
      if (!best || thr > best.threshold) best = { threshold: thr, hitRate: h };
    }
  }
  return best;
}

// ─── Match / team leg builders ────────────────────────────────────────────────

function buildMatchLegs(input: SoccerKitchenInput): SoccerKitchenLeg[] {
  const legs: SoccerKitchenLeg[] = [];

  // Parse ESPN history for home team (home games) and away team (away games)
  const homeFor: number[] = [], homeAgainst: number[] = [];
  for (const g of input.homeHistory) {
    const p = parseScore(g.score);
    if (!p) continue;
    const [scored, conceded] = g.homeAway === "home" ? p : [p[1], p[0]];
    homeFor.push(scored); homeAgainst.push(conceded);
  }

  const awayFor: number[] = [], awayAgainst: number[] = [];
  for (const g of input.awayHistory) {
    const p = parseScore(g.score);
    if (!p) continue;
    const [scored, conceded] = g.homeAway === "away" ? [p[1], p[0]] : p;
    awayFor.push(scored); awayAgainst.push(conceded);
  }

  // ── Total Goals Over / Under ──────────────────────────────────────────────
  if (homeFor.length >= 3 && awayFor.length >= 3) {
    const homeMatchTotals = homeFor.map((g, i) => g + (homeAgainst[i] ?? 0));
    const awayMatchTotals = awayFor.map((g, i) => g + (awayAgainst[i] ?? 0));
    const allTotals = [...homeMatchTotals, ...awayMatchTotals];
    const avgMatch = mean(allTotals);

    for (const thr of [2.5, 1.5]) {
      const hRate = hr(homeMatchTotals, thr + 0.1);
      const aRate = hr(awayMatchTotals, thr + 0.1);
      const combined = (hRate + aRate) / 2;
      
      if (combined >= 0.55) {
        const breakdown = computeReliability({
          vals: allTotals,
          threshold: thr + 0.1,
          config: SOCCER_CONFIG,
        });

        legs.push({
          legType: "match", stat: "matchGoals",
          statLabel: `Total Goals Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: combined,
          reliability: breakdown.finalReliability,
          avgStat: Math.round(avgMatch * 10) / 10,
          gamesAnalyzed: allTotals.length,
          breakdown,
          isOnForm: false, isBounceBack: false,
        });
        break;
      }
    }
  }

  // ── Both Teams to Score ───────────────────────────────────────────────────
  if (homeFor.length >= 3 && awayFor.length >= 3) {
    const homeScoredRate = hr(homeFor, 1);
    const awayScoredRate = hr(awayFor, 1);
    const prob = homeScoredRate * awayScoredRate;
    if (prob >= 0.50) {
      // Fake vals for engine: 1 if both scored, 0 if not
      const fakeVals = new Array(homeFor.length).fill(0).map((_, i) => 
        (homeFor[i] >= 1 && homeAgainst[i] >= 1) ? 1 : 0
      );
      const breakdown = computeReliability({
        vals: fakeVals,
        threshold: 0.5,
        config: SOCCER_CONFIG,
      });

      legs.push({
        legType: "match", stat: "btts",
        statLabel: "Both Teams to Score",
        threshold: 1, direction: "over",
        hitRate: prob,
        reliability: breakdown.finalReliability,
        avgStat: 0,
        gamesAnalyzed: homeFor.length,
        breakdown,
        isOnForm: false, isBounceBack: false,
      });
    }
  }

  // ── Home team goals (team total market) ───────────────────────────────────
  if (homeFor.length >= 3) {
    const avg = mean(homeFor);
    if (avg >= 0.8) {
      const found = findThreshold(homeFor, avg, 0.5, 0.58, 1.0, 0.30, 0.88);
      if (found) {
        // Opponent concession boost
        const oppConcededAvg = input.awayTeamStats?.goalsConceded && input.awayTeamStats.matches > 0
          ? input.awayTeamStats.goalsConceded / input.awayTeamStats.matches : 0;
        const oppBoost = computeOpponentRankBoost(avg, oppConcededAvg);
        const weatherPenalty = computeWeatherPenalty("teamGoals", input.weather);
        const venueBoost = computeVenueBoost("home");
        const restPenalty = computeRestDaysPenalty(input.homeRestDays ?? 0);
        const signalTotal = oppBoost + weatherPenalty + venueBoost + restPenalty;

        const breakdown = computeReliability({
          vals: homeFor,
          threshold: found.threshold,
          config: SOCCER_CONFIG,
          contextualBonus: Math.max(0, signalTotal),
        });
        const finalRel = Math.max(0, Math.min(1.0, breakdown.finalReliability + (signalTotal < 0 ? signalTotal : 0)));

        legs.push({
          legType: "team", teamName: input.homeTeamName, teamAbbr: input.homeAbbr, side: "home",
          stat: "teamGoals", statLabel: `${input.homeTeamName} Over ${found.threshold} Goals`,
          threshold: found.threshold, direction: "over",
          hitRate: found.hitRate,
          reliability: finalRel,
          avgStat: Math.round(avg * 10) / 10,
          gamesAnalyzed: homeFor.length,
          breakdown: { ...breakdown, finalReliability: finalRel },
          isOnForm: mean(homeFor.slice(-3)) >= avg * 1.1,
          isBounceBack: (homeFor[homeFor.length - 1] ?? 0) === 0 && avg >= 1.5,
          signalTotal,
        });
      }
    }
  }

  // ── Away team goals ────────────────────────────────────────────────────────
  if (awayFor.length >= 3) {
    const avg = mean(awayFor);
    if (avg >= 0.6) {
      const found = findThreshold(awayFor, avg, 0.5, 0.52, 1.0, 0.28, 0.85);
      if (found) {
        const oppConcededAvg = input.homeTeamStats?.goalsConceded && input.homeTeamStats.matches > 0
          ? input.homeTeamStats.goalsConceded / input.homeTeamStats.matches : 0;
        const oppBoost = computeOpponentRankBoost(avg, oppConcededAvg);
        const weatherPenalty = computeWeatherPenalty("teamGoals", input.weather);
        const venueBoost = computeVenueBoost("away");
        const restPenalty = computeRestDaysPenalty(input.awayRestDays ?? 0);
        const signalTotal = oppBoost + weatherPenalty + venueBoost + restPenalty;

        const breakdown = computeReliability({
          vals: awayFor,
          threshold: found.threshold,
          config: SOCCER_CONFIG,
          contextualBonus: Math.max(0, signalTotal),
        });
        const finalRel = Math.max(0, Math.min(1.0, breakdown.finalReliability + (signalTotal < 0 ? signalTotal : 0)));

        legs.push({
          legType: "team", teamName: input.awayTeamName, teamAbbr: input.awayAbbr, side: "away",
          stat: "teamGoals", statLabel: `${input.awayTeamName} Over ${found.threshold} Goals`,
          threshold: found.threshold, direction: "over",
          hitRate: found.hitRate,
          reliability: finalRel,
          avgStat: Math.round(avg * 10) / 10,
          gamesAnalyzed: awayFor.length,
          breakdown: { ...breakdown, finalReliability: finalRel },
          isOnForm: mean(awayFor.slice(-3)) >= avg * 1.1,
          isBounceBack: (awayFor[awayFor.length - 1] ?? 0) === 0 && avg >= 1.2,
          signalTotal,
        });
      }
    }
  }

  // ── Corners (from Sofascore team stats) ───────────────────────────────────
  const hCorners = input.homeTeamStats?.corners && input.homeTeamStats.matches > 0
    ? input.homeTeamStats.corners / input.homeTeamStats.matches : null;
  const aCorners = input.awayTeamStats?.corners && input.awayTeamStats.matches > 0
    ? input.awayTeamStats.corners / input.awayTeamStats.matches : null;
  if (hCorners !== null && aCorners !== null) {
    const matchAvg = hCorners + aCorners;
    // Synthesize a game-by-game sample from season averages so the engine can
    // apply its sample-factor and consistency-factor properly.
    const n = Math.min(Math.max(input.homeTeamStats?.matches ?? 10, input.awayTeamStats?.matches ?? 10), 30);
    const syntheticVals = Array.from({ length: n }, () => matchAvg);
    for (const thr of [9.5, 8.5, 7.5]) {
      if (thr >= matchAvg * 0.95) continue; // threshold above avg — skip
      const breakdown = computeReliability({ vals: syntheticVals, threshold: thr, config: SOCCER_CONFIG });
      if (breakdown.finalReliability >= 0.52) {
        legs.push({
          legType: "match", stat: "corners",
          statLabel: `Corners Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: breakdown.weightedHitRate,
          reliability: breakdown.finalReliability,
          avgStat: Math.round(matchAvg * 10) / 10,
          gamesAnalyzed: n,
          breakdown,
          isOnForm: false, isBounceBack: false,
        });
        break;
      }
    }
  }

  return legs;
}

function buildCardMatchLegs(input: SoccerKitchenInput): SoccerKitchenLeg[] {
  const legs: SoccerKitchenLeg[] = [];
  const hCards = input.homeTeamStats && input.homeTeamStats.matches > 0
    ? (input.homeTeamStats.yellowCards ?? 0) / input.homeTeamStats.matches : null;
  const aCards = input.awayTeamStats && input.awayTeamStats.matches > 0
    ? (input.awayTeamStats.yellowCards ?? 0) / input.awayTeamStats.matches : null;

  if (hCards !== null && aCards !== null) {
    const matchAvg = hCards + aCards;
    const n = Math.min(Math.max(input.homeTeamStats?.matches ?? 10, input.awayTeamStats?.matches ?? 10), 30);
    const syntheticVals = Array.from({ length: n }, () => matchAvg);
    for (const thr of [3.5, 2.5]) {
      if (thr >= matchAvg * 0.95) continue;
      const breakdown = computeReliability({ vals: syntheticVals, threshold: thr, config: SOCCER_CONFIG });
      if (breakdown.finalReliability >= 0.52) {
        legs.push({
          legType: "match", stat: "totalCards",
          statLabel: `Total Cards Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: breakdown.weightedHitRate,
          reliability: breakdown.finalReliability,
          avgStat: Math.round(matchAvg * 10) / 10,
          gamesAnalyzed: n,
          breakdown,
          isOnForm: false, isBounceBack: false,
        });
        break;
      }
    }
  }

  return legs;
}

// ─── Player profile builder ───────────────────────────────────────────────────

interface PlayerStatConfig {
  key:       keyof SofascoreGameLog | "scoreOrAssist";
  stat:      SoccerStatKey;
  label:     string;
  step:      number;
  minAvg:    number;
  posFilter?: string[];
}

const PLAYER_STATS: PlayerStatConfig[] = [
  { key: "scoreOrAssist", stat: "scoreOrAssist", label: "Score or Assist",      step: 0.5, minAvg: 0.25 },
  { key: "goals",          stat: "goals",         label: "Anytime Goalscorer",   step: 0.5, minAvg: 0.18 },
  { key: "assists",        stat: "assists",        label: "To Assist",            step: 0.5, minAvg: 0.15 },
  { key: "shotsOnTarget",  stat: "shotsOnTarget",  label: "Shots on Target",      step: 0.5, minAvg: 0.40 },
  { key: "shots",          stat: "shots",          label: "Player Shots",         step: 0.5, minAvg: 0.80 },
  { key: "tackles",        stat: "tackles",        label: "Player Tackles",       step: 1.0, minAvg: 1.0, posFilter: ["D", "M"] },
  { key: "foulsCommitted", stat: "foulsCommitted", label: "Fouls Committed",      step: 1.0, minAvg: 1.0, posFilter: ["D", "M", "F", "A"] },
  { key: "yellowCards",    stat: "yellowCards",    label: "Player Card",          step: 0.5, minAvg: 0.12 },
  { key: "saves",          stat: "saves",          label: "Goalkeeper Saves",     step: 0.5, minAvg: 1.0, posFilter: ["G"] },
];

interface PlayerProfile {
  player:       SoccerPlayerProfile;
  stat:         PlayerStatConfig;
  vals:         number[];
  avg:          number;
  recentAvg:    number;
  isOnForm:     boolean;
  isBounceBack: boolean;
  signals:      { oppBoost: number; weatherPenalty: number; venueBoost: number; restPenalty: number; rotationPenalty: number; setPieceBonus: number; usageBoost: number };
}

function getVals(games: SofascoreGameLog[], key: PlayerStatConfig["key"]): number[] {
  if (key === "scoreOrAssist") {
    return games
      .map(g => {
        const gv = typeof g.goals === "number" ? g.goals : null;
        const av = typeof g.assists === "number" ? g.assists : null;
        if (gv === null && av === null) return null;
        return (gv ?? 0) + (av ?? 0);
      })
      .filter((v): v is number => v !== null);
  }
  return games
    .map(g => {
      const v = g[key as keyof SofascoreGameLog];
      return typeof v === "number" ? v : null;
    })
    .filter((v): v is number => v !== null);
}

function buildPlayerProfiles(input: SoccerKitchenInput): PlayerProfile[] {
  const profiles: PlayerProfile[] = [];

  for (const p of input.players) {
    if (p.games.length < 3) continue;
    const posGroup = p.position.toUpperCase()[0] ?? "M";

    for (const sc of PLAYER_STATS) {
      if (sc.posFilter && !sc.posFilter.includes(posGroup)) continue;

      const vals = getVals(p.games, sc.key);
      if (vals.length < 3) continue;

      const avg = mean(vals);
      if (avg < sc.minAvg) continue;

      const recent3    = vals.slice(-3);
      const recentAvg  = mean(recent3);
      const isOnForm   = recent3.length >= 3 && recentAvg >= avg * 1.10;
      const lastVal    = vals[vals.length - 1] ?? 0;
      const isBounceBack = lastVal < avg * 0.5 && avg >= sc.minAvg * 2;

      const opponentStats = p.side === "home" ? input.awayTeamStats : input.homeTeamStats;
      let oppBoost = 0;
      if (opponentStats && opponentStats.matches > 0 && avg > 0) {
        if (sc.stat === "goals" || sc.stat === "scoreOrAssist") {
          // How many goals does the opponent concede per game vs this player's own avg?
          const oppConcededAvg = opponentStats.goalsConceded / opponentStats.matches;
          oppBoost = computeOpponentRankBoost(avg, oppConcededAvg);
        } else if (sc.stat === "shotsOnTarget" || sc.stat === "shots") {
          // Proxy: total shots faced by opponent = goals conceded + saves
          const sOTConceded = (opponentStats.goalsConceded + (opponentStats.saves ?? 0)) / opponentStats.matches;
          oppBoost = computeOpponentRankBoost(avg, sOTConceded);
        }
      }

      const weatherPenalty  = computeWeatherPenalty(sc.stat, input.weather);
      const venueBoost      = computeVenueBoost(p.side);
      const restPenalty     = computeRestDaysPenalty(p.side === "home" ? input.homeRestDays ?? 0 : input.awayRestDays ?? 0);
      const rotationPenalty = computeRotationPenalty(p.games);
      const setPieceBonus   = computeSetPieceBonus(p, sc.stat);
      const usageBoost      = computeUsageBoost(p, input.players, sc.stat);

      profiles.push({
        player: p, stat: sc, vals, avg, recentAvg, isOnForm, isBounceBack,
        signals: { oppBoost, weatherPenalty, venueBoost, restPenalty, rotationPenalty, setPieceBonus, usageBoost }
      });
    }
  }

  return profiles;
}

// ─── Player leg builder ───────────────────────────────────────────────────────

interface TierConfig {
  minHR:       number;
  maxHR:       number;
  minFrac:     number;
  maxFrac:     number;
  minRel:      number;
  maxLegs:     number;
  statFilter?: SoccerStatKey[];
  formBonus:   number;
}

function buildPlayerLegs(
  profiles: PlayerProfile[],
  tier: TierConfig,
  exclude: Set<string> = new Set(),
  propOdds?: Map<string, SoccerProp>,
): SoccerKitchenLeg[] {
  const candidates: { leg: SoccerKitchenLeg; rel: number }[] = [];

  for (const prof of profiles) {
    if (tier.statFilter && !tier.statFilter.includes(prof.stat.stat)) continue;

    const base = tier.formBonus > 0 && prof.isOnForm ? prof.recentAvg : prof.avg;
    
    // Check for real prop odds
    const prop = propOdds?.get(`${prof.player.name}|${prof.stat.stat}`);
    
    let threshold: number;
    let hitRate: number;
    
    if (prop) {
      threshold = prop.line;
      hitRate   = hr(prof.vals, threshold);
      // Ensure hitRate is within tier limits
      if (hitRate < tier.minHR || hitRate > tier.maxHR) continue;
    } else {
      const found = findThreshold(prof.vals, base, prof.stat.step,
        tier.minHR, tier.maxHR, tier.minFrac, tier.maxFrac);
      if (!found) continue;
      threshold = snapToMarket(found.threshold, prof.stat.stat);
      hitRate   = hr(prof.vals, threshold);
    }

    const signalTotal = prof.signals.oppBoost + prof.signals.weatherPenalty + prof.signals.venueBoost +
                        prof.signals.restPenalty + prof.signals.rotationPenalty + prof.signals.setPieceBonus +
                        prof.signals.usageBoost;

    const breakdown = computeReliability({
      vals: prof.vals,
      threshold,
      config: SOCCER_CONFIG,
    });

    // Apply signals uniformly after engine (same pattern as AFL kitchen)
    let rel = Math.max(0, Math.min(1.0, breakdown.finalReliability + signalTotal));
    if (prof.isOnForm) rel = Math.min(1.0, rel + tier.formBonus);

    if (rel < tier.minRel) continue;

    const key = `${prof.player.name}|${prof.stat.stat}|${threshold}`;
    if (exclude.has(key)) continue;

    candidates.push({
      rel,
      leg: {
        legType:       "player",
        player:        prof.player.name,
        shortName:     prof.player.shortName,
        side:          prof.player.side,
        teamAbbr:      prof.player.teamAbbr,
        stat:          prof.stat.stat,
        statLabel:     prof.stat.label,
        threshold,
        direction:     "over",
        hitRate,
        reliability:   rel,
        avgStat:       Math.round(prof.avg * 100) / 100,
        gamesAnalyzed: prof.vals.length,
        breakdown:     { ...breakdown, finalReliability: rel },
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
        signalTotal:   Math.round(signalTotal * 100) / 100,
        prop,
      },
    });
  }

  candidates.sort((a, b) => b.rel - a.rel);

  const legs: SoccerKitchenLeg[] = [];
  const playerStatCount = new Map<string, number>();

  for (const { leg } of candidates) {
    if (legs.length >= tier.maxLegs) break;
    const pk = `${leg.player}|${leg.stat}`;
    if ((playerStatCount.get(pk) ?? 0) >= 1) continue;
    const pc = leg.player ?? "";
    if ((playerStatCount.get(pc) ?? 0) >= 2) continue;

    legs.push(leg);
    playerStatCount.set(pk, 1);
    playerStatCount.set(pc, (playerStatCount.get(pc) ?? 0) + 1);
  }

  return legs;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeSoccerKitchen(input: SoccerKitchenInput): SoccerKitchenSlip[] {
  const profiles   = buildPlayerProfiles(input);
  const matchLegs  = buildMatchLegs(input);
  const cardMatchLegs = buildCardMatchLegs(input);

  const safeMatchLegs   = matchLegs.filter(l => l.hitRate >= 0.70).slice(0, 3);
  const doableMatchLegs = matchLegs.filter(l => l.hitRate >= 0.58 && l.hitRate < 0.70).slice(0, 2);

  // ── 1. Safe ───────────────────────────────────────────────────────────────
  const safePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.72, maxHR: 1.0,
    minFrac: 0.28, maxFrac: 0.62,
    minRel: 0.45, maxLegs: 3 - safeMatchLegs.length,
    formBonus: 0,
  }, new Set(), input.propOdds);
  const safeLegs = [...safeMatchLegs, ...safePlayerLegs].slice(0, 3);

  // ── 2. Doable ─────────────────────────────────────────────────────────────
  const doablePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.55, maxHR: 0.78,
    minFrac: 0.35, maxFrac: 0.80,
    minRel: 0.28, maxLegs: 5,
    statFilter: ["scoreOrAssist", "goals", "assists"],
    formBonus: 0.04,
  }, new Set(), input.propOdds);
  const doableLegs = [...doableMatchLegs, ...doablePlayerLegs].slice(0, 3);

  // ── 3. Goal Scorers ───────────────────────────────────────────────────────
  const goalLegs = buildPlayerLegs(profiles, {
    minHR: 0.30, maxHR: 0.80,
    minFrac: 0.25, maxFrac: 0.75,
    minRel: 0.12, maxLegs: 4,
    statFilter: ["goals"],
    formBonus: 0.03,
  }, new Set(), input.propOdds);

  // ── 4. Shots ─────────────────────────────────────────────────────────────
  const shotLegs = buildPlayerLegs(profiles, {
    minHR: 0.45, maxHR: 0.85,
    minFrac: 0.35, maxFrac: 0.80,
    minRel: 0.22, maxLegs: 4,
    statFilter: ["shots", "shotsOnTarget"],
    formBonus: 0.03,
  }, new Set(), input.propOdds);

  // ── 5. Cards ──────────────────────────────────────────────────────────────
  const playerCardLegs = buildPlayerLegs(profiles, {
    minHR: 0.20, maxHR: 0.75,
    minFrac: 0.35, maxFrac: 1.0,
    minRel: 0.08, maxLegs: 2,
    statFilter: ["yellowCards"],
    formBonus: 0,
  }, new Set(), input.propOdds);
  const cardLegs = [...cardMatchLegs, ...playerCardLegs].slice(0, 4);

  // ── 6. Value ──────────────────────────────────────────────────────────────
  const valueProfiles: { leg: SoccerKitchenLeg; score: number }[] = [];
  for (const prof of profiles) {
    const BETTABLE: SoccerStatKey[] = ["scoreOrAssist","goals","assists","shots","shotsOnTarget","tackles","yellowCards","foulsCommitted","saves"];
    if (!BETTABLE.includes(prof.stat.stat)) continue;

    // Check if we have real prop odds for this player/stat
    const prop = input.propOdds?.get(`${prof.player.name}|${prof.stat.stat}`);
    
    let threshold: number;
    let hitRate: number;
    
    if (prop) {
      threshold = prop.line;
      hitRate   = hr(prof.vals, threshold);
    } else {
      const found = findThreshold(prof.vals, prof.avg, prof.stat.step, 0.50, 0.82, 0.45, 0.85);
      if (!found) continue;
      threshold = found.threshold;
      hitRate   = found.hitRate;
    }

    const signalTotal = prof.signals.oppBoost + prof.signals.weatherPenalty + prof.signals.venueBoost +
                        prof.signals.restPenalty + prof.signals.rotationPenalty + prof.signals.setPieceBonus +
                        prof.signals.usageBoost;
    const breakdown = computeReliability({
      vals: prof.vals,
      threshold,
      config: SOCCER_CONFIG,
    });
    let rel = Math.max(0, Math.min(1.0, breakdown.finalReliability + signalTotal));

    const edge = prof.avg - threshold;
    if (edge <= 0 || rel < 0.18) continue;
    
    // Scoring: (edge / threshold) * price (if any) * reliability * hitRate
    const price = prop?.price ?? 1.83; // 1.83 as neutral "fair" odds
    const score = (edge / Math.max(threshold, 0.1)) * price * rel * hitRate;

    valueProfiles.push({
      score,
      leg: {
        legType:       "player",
        player:        prof.player.name,
        shortName:     prof.player.shortName,
        side:          prof.player.side,
        teamAbbr:      prof.player.teamAbbr,
        stat:          prof.stat.stat,
        statLabel:     prof.stat.label,
        threshold:     threshold,
        direction:     "over",
        hitRate:       hitRate,
        reliability:   rel,
        avgStat:       Math.round(prof.avg * 100) / 100,
        gamesAnalyzed: prof.vals.length,
        breakdown:     { ...breakdown, finalReliability: rel },
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
        edge:          Math.round(edge * 100) / 100,
        signalTotal:   Math.round(signalTotal * 100) / 100,
        prop,
      },
    });
  }
  valueProfiles.sort((a, b) => b.score - a.score);

  const valueSeen = new Set<string>();
  const valueLegs: SoccerKitchenLeg[] = [];
  for (const { leg } of valueProfiles) {
    const k = `${leg.player}|${leg.stat}`;
    if (valueSeen.has(k)) continue;
    valueSeen.add(k);
    valueLegs.push(leg);
    if (valueLegs.length >= 8) break;
  }

  return [
    { type: "safe",        legs: safeLegs },
    { type: "doable",      legs: doableLegs },
    { type: "goalscorers", legs: goalLegs },
    { type: "shots",       legs: shotLegs },
    { type: "cards",       legs: cardLegs },
    { type: "value",       legs: valueLegs },
  ];
}
