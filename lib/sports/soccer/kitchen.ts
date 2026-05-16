/**
 * Soccer Kitchen — slip generator aligned to real bookmaker markets.
 *
 * Markets covered:
 *   MATCH:   Both Teams to Score · Over/Under Total Goals · Over Corners
 *            Over Total Cards · Both Teams to Receive Cards · Total Shots
 *
 *   PLAYER:  Score or Assist · Anytime Goalscorer · Player Shots on Target
 *            Player Shots · Player Card · Player Tackles
 *            Fouls Committed · Goalkeeper Saves
 *
 * Slip types:
 *   safe        — BTTS + Over Goals + reliable match total legs
 *   doable      — Score or Assist player props (most popular market)
 *   goalscorers — Anytime Goalscorer legs only
 *   shots       — Player Shots on Target + Player Shots
 *   cards       — Total Cards · Both Teams to Receive Cards · Player Card
 *   value       — Best edge picks across all markets
 */

import type { TeamHistoryGame } from "@/lib/sports/espn";
import type { SofascoreGameLog, SofascoreTeamStats } from "@/lib/sports/sofascore";

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
  breakdown:     string[];
  isOnForm:      boolean;
  isBounceBack:  boolean;
  edge?:         number;
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

function sampleFactor(n: number): number {
  return Math.min(1, (n - 2) / 8);
}

function reliability(hitRate: number, n: number): number {
  return Math.round(hitRate * sampleFactor(n) * 100) / 100;
}

function snap(raw: number, step: number): number {
  return Math.round(raw / step) * step;
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

interface MatchLeg {
  stat: SoccerKitchenLeg["stat"];
  label: string;
  threshold: number;
  hitRate: number;
  avgStat: number;
  gamesAnalyzed: number;
  breakdown: string[];
}

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

  const n = Math.min(homeFor.length, awayFor.length);

  // ── Total Goals Over / Under ──────────────────────────────────────────────
  if (n >= 3) {
    const homeMatchTotals = homeFor.map((g, i) => g + (homeAgainst[i] ?? 0));
    const awayMatchTotals = awayFor.map((g, i) => g + (awayAgainst[i] ?? 0));
    const avgMatch = (mean(homeMatchTotals) + mean(awayMatchTotals)) / 2;

    for (const thr of [2.5, 1.5]) {
      const hRate = homeMatchTotals.filter(t => t > thr).length / homeMatchTotals.length;
      const aRate = awayMatchTotals.filter(t => t > thr).length / awayMatchTotals.length;
      const combined = (hRate + aRate) / 2;
      if (combined >= 0.55) {
        legs.push({
          legType: "match", stat: "matchGoals",
          statLabel: `Total Goals Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: combined,
          reliability: reliability(combined, n),
          avgStat: Math.round(avgMatch * 10) / 10,
          gamesAnalyzed: n,
          breakdown: [
            `${input.homeAbbr} home games: ${Math.round(hRate * 100)}% over ${thr}`,
            `${input.awayAbbr} away games: ${Math.round(aRate * 100)}% over ${thr}`,
            `Avg match total: ${avgMatch.toFixed(1)} goals`,
          ],
          isOnForm: false, isBounceBack: false,
        });
        break;
      }
    }
  }

  // ── Both Teams to Score ───────────────────────────────────────────────────
  if (homeFor.length >= 3 && awayFor.length >= 3) {
    const homeScoredRate = homeFor.filter(g => g >= 1).length / homeFor.length;
    const awayScoredRate = awayFor.filter(g => g >= 1).length / awayFor.length;
    const prob = homeScoredRate * awayScoredRate;
    if (prob >= 0.50) {
      legs.push({
        legType: "match", stat: "btts",
        statLabel: "Both Teams to Score",
        threshold: 1, direction: "over",
        hitRate: prob,
        reliability: reliability(prob, n),
        avgStat: 0,
        gamesAnalyzed: n,
        breakdown: [
          `${input.homeAbbr} scored in ${Math.round(homeScoredRate * 100)}% of home games`,
          `${input.awayAbbr} scored in ${Math.round(awayScoredRate * 100)}% of away games`,
          `Combined probability: ${Math.round(prob * 100)}%`,
        ],
        isOnForm: false, isBounceBack: false,
      });
    }
  }

  // ── Home team goals (team total market) ───────────────────────────────────
  if (homeFor.length >= 3) {
    const avg = mean(homeFor);
    if (avg >= 0.8) {
      const recent3 = homeFor.slice(-3);
      for (const [minHR, maxHR, minF, maxF] of [
        [0.72, 1.0, 0.30, 0.62] as const,
        [0.58, 0.75, 0.62, 0.88] as const,
      ]) {
        const found = findThreshold(homeFor, avg, 0.5, minHR, maxHR, minF, maxF);
        if (found) {
          legs.push({
            legType: "team", teamName: input.homeTeamName, teamAbbr: input.homeAbbr, side: "home",
            stat: "teamGoals", statLabel: `${input.homeTeamName} Over ${found.threshold} Goals`,
            threshold: found.threshold, direction: "over",
            hitRate: found.hitRate,
            reliability: reliability(found.hitRate, homeFor.length),
            avgStat: Math.round(avg * 10) / 10,
            gamesAnalyzed: homeFor.length,
            breakdown: [
              `Avg ${avg.toFixed(1)} goals/game at home`,
              `Scored ${found.threshold}+ in ${Math.round(found.hitRate * 100)}% of home games`,
              mean(recent3) >= avg * 1.1 ? `On form — avg ${mean(recent3).toFixed(1)} last 3 games` : `Season avg: ${avg.toFixed(1)}`,
            ],
            isOnForm: mean(recent3) >= avg * 1.1,
            isBounceBack: (homeFor[homeFor.length - 1] ?? 0) === 0 && avg >= 1.5,
          });
          break;
        }
      }
    }
  }

  // ── Away team goals ────────────────────────────────────────────────────────
  if (awayFor.length >= 3) {
    const avg = mean(awayFor);
    if (avg >= 0.6) {
      const recent3 = awayFor.slice(-3);
      for (const [minHR, maxHR, minF, maxF] of [
        [0.65, 1.0, 0.28, 0.58] as const,
        [0.52, 0.68, 0.55, 0.85] as const,
      ]) {
        const found = findThreshold(awayFor, avg, 0.5, minHR, maxHR, minF, maxF);
        if (found) {
          legs.push({
            legType: "team", teamName: input.awayTeamName, teamAbbr: input.awayAbbr, side: "away",
            stat: "teamGoals", statLabel: `${input.awayTeamName} Over ${found.threshold} Goals`,
            threshold: found.threshold, direction: "over",
            hitRate: found.hitRate,
            reliability: reliability(found.hitRate, awayFor.length),
            avgStat: Math.round(avg * 10) / 10,
            gamesAnalyzed: awayFor.length,
            breakdown: [
              `Avg ${avg.toFixed(1)} goals/game away`,
              `Scored ${found.threshold}+ in ${Math.round(found.hitRate * 100)}% of away games`,
              mean(recent3) >= avg * 1.1 ? `On form — avg ${mean(recent3).toFixed(1)} last 3 games` : `Season avg: ${avg.toFixed(1)}`,
            ],
            isOnForm: mean(recent3) >= avg * 1.1,
            isBounceBack: (awayFor[awayFor.length - 1] ?? 0) === 0 && avg >= 1.2,
          });
          break;
        }
      }
    }
  }

  // ── Corners (from Sofascore team stats) ───────────────────────────────────
  const homeCorners = input.homeTeamStats?.corners && input.homeTeamStats.matches > 0
    ? input.homeTeamStats.corners / input.homeTeamStats.matches : null;
  const awayCorners = input.awayTeamStats?.corners && input.awayTeamStats.matches > 0
    ? input.awayTeamStats.corners / input.awayTeamStats.matches : null;
  if (homeCorners !== null && awayCorners !== null) {
    const matchAvg = homeCorners + awayCorners;
    for (const thr of [9.5, 8.5, 7.5]) {
      const estHR = thr < matchAvg * 0.82 ? 0.72 : thr < matchAvg * 0.95 ? 0.60 : 0;
      if (estHR >= 0.60) {
        legs.push({
          legType: "match", stat: "corners",
          statLabel: `Corners Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: estHR,
          reliability: reliability(estHR, Math.min(input.homeTeamStats?.matches ?? 10, 20)),
          avgStat: Math.round(matchAvg * 10) / 10,
          gamesAnalyzed: Math.min(input.homeTeamStats?.matches ?? 10, 30),
          breakdown: [
            `${input.homeAbbr} avg ${homeCorners.toFixed(1)} corners/game`,
            `${input.awayAbbr} avg ${awayCorners.toFixed(1)} corners/game`,
            `Match avg: ${matchAvg.toFixed(1)} combined corners`,
          ],
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
    // Total cards over
    for (const thr of [3.5, 2.5]) {
      const estHR = thr < matchAvg * 0.80 ? 0.70 : thr < matchAvg * 0.95 ? 0.60 : 0;
      if (estHR >= 0.60) {
        legs.push({
          legType: "match", stat: "totalCards",
          statLabel: `Total Cards Over ${thr}`,
          threshold: thr, direction: "over",
          hitRate: estHR,
          reliability: reliability(estHR, Math.min(input.homeTeamStats?.matches ?? 10, 25)),
          avgStat: Math.round(matchAvg * 10) / 10,
          gamesAnalyzed: Math.min(input.homeTeamStats?.matches ?? 10, 30),
          breakdown: [
            `${input.homeAbbr} avg ${hCards.toFixed(1)} yellow cards/game`,
            `${input.awayAbbr} avg ${aCards.toFixed(1)} yellow cards/game`,
            `Match avg: ${matchAvg.toFixed(1)} total cards`,
          ],
          isOnForm: false, isBounceBack: false,
        });
        break;
      }
    }

    // Both Teams to Receive Cards (rough estimate)
    const homePct = hCards >= 1.2 ? 0.75 : hCards >= 0.8 ? 0.62 : 0.50;
    const awayPct = aCards >= 1.2 ? 0.75 : aCards >= 0.8 ? 0.62 : 0.50;
    const btrcProb = homePct * awayPct;
    if (btrcProb >= 0.45) {
      legs.push({
        legType: "match", stat: "totalCards",
        statLabel: "Both Teams to Receive Cards",
        threshold: 1, direction: "over",
        hitRate: btrcProb,
        reliability: reliability(btrcProb, Math.min(input.homeTeamStats?.matches ?? 10, 20)),
        avgStat: 0,
        gamesAnalyzed: Math.min(input.homeTeamStats?.matches ?? 10, 30),
        breakdown: [
          `${input.homeAbbr} avg ${hCards.toFixed(1)} yellows/game`,
          `${input.awayAbbr} avg ${aCards.toFixed(1)} yellows/game`,
          `Est. probability both booked: ${Math.round(btrcProb * 100)}%`,
        ],
        isOnForm: false, isBounceBack: false,
      });
    }
  }

  return legs;
}

// ─── Player profile builder ───────────────────────────────────────────────────

interface PlayerStatConfig {
  key:       keyof SofascoreGameLog | "scoreOrAssist";
  stat:      SoccerStatKey;
  label:     string;   // exact bookmaker market name
  step:      number;
  minAvg:    number;
  posFilter?: string[]; // only include these position groups (G, D, M, F)
}

const PLAYER_STATS: PlayerStatConfig[] = [
  // Most popular market — combined score or assist
  { key: "scoreOrAssist", stat: "scoreOrAssist", label: "Score or Assist",      step: 0.5, minAvg: 0.25 },
  // Anytime scorer
  { key: "goals",          stat: "goals",         label: "Anytime Goalscorer",   step: 0.5, minAvg: 0.18 },
  // Assist-only
  { key: "assists",        stat: "assists",        label: "To Assist",            step: 0.5, minAvg: 0.15 },
  // Shots markets
  { key: "shotsOnTarget",  stat: "shotsOnTarget",  label: "Shots on Target",      step: 0.5, minAvg: 0.40 },
  { key: "shots",          stat: "shots",          label: "Player Shots",         step: 0.5, minAvg: 0.80 },
  // Defensive / physical markets
  { key: "tackles",        stat: "tackles",        label: "Player Tackles",       step: 1.0, minAvg: 1.0, posFilter: ["D", "M"] },
  { key: "foulsCommitted", stat: "foulsCommitted", label: "Fouls Committed",      step: 1.0, minAvg: 1.0 },
  // Card market
  { key: "yellowCards",    stat: "yellowCards",    label: "Player Card",          step: 0.5, minAvg: 0.12 },
  // GK only
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

function buildPlayerProfiles(players: SoccerPlayerProfile[]): PlayerProfile[] {
  const profiles: PlayerProfile[] = [];

  for (const p of players) {
    if (p.games.length < 3) continue;
    const posGroup = p.position.toUpperCase()[0] ?? "M";

    for (const sc of PLAYER_STATS) {
      // Position filter
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

      profiles.push({ player: p, stat: sc, vals, avg, recentAvg, isOnForm, isBounceBack });
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
): SoccerKitchenLeg[] {
  const candidates: { leg: SoccerKitchenLeg; rel: number }[] = [];

  for (const prof of profiles) {
    if (tier.statFilter && !tier.statFilter.includes(prof.stat.stat)) continue;

    const base = tier.formBonus > 0 && prof.isOnForm ? prof.recentAvg : prof.avg;
    const found = findThreshold(prof.vals, base, prof.stat.step,
      tier.minHR, tier.maxHR, tier.minFrac, tier.maxFrac);
    if (!found) continue;

    let rel = reliability(found.hitRate, prof.vals.length);
    if (prof.isOnForm) rel = Math.min(1, rel + tier.formBonus);
    if (rel < tier.minRel) continue;

    const key = `${prof.player.name}|${prof.stat.stat}|${found.threshold}`;
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
        threshold:     found.threshold,
        direction:     "over",
        hitRate:       found.hitRate,
        reliability:   rel,
        avgStat:       Math.round(prof.avg * 100) / 100,
        gamesAnalyzed: prof.vals.length,
        breakdown: [
          `Avg ${prof.avg.toFixed(2)} ${prof.stat.label.toLowerCase()}/game`,
          `Hit ${found.threshold}+ in ${Math.round(found.hitRate * 100)}% of games`,
          ...(prof.isOnForm ? [`▲ On form — avg ${prof.recentAvg.toFixed(2)} last 3 games`] : []),
          ...(prof.isBounceBack ? ["↺ Bounce-back candidate"] : []),
        ],
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
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
  const profiles   = buildPlayerProfiles(input.players);
  const matchLegs  = buildMatchLegs(input);
  const cardMatchLegs = buildCardMatchLegs(input);

  // Partition match legs by confidence
  const safeMatchLegs   = matchLegs.filter(l => l.hitRate >= 0.70).slice(0, 3);
  const doableMatchLegs = matchLegs.filter(l => l.hitRate >= 0.58 && l.hitRate < 0.70).slice(0, 2);

  const safeKeys = new Set(safeMatchLegs.map(l => `${l.teamName ?? "match"}|${l.stat}|${l.threshold}`));

  // ── 1. Safe ───────────────────────────────────────────────────────────────
  // Best match legs + any player legs at 78%+ hit rate
  const safePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.72, maxHR: 1.0,
    minFrac: 0.28, maxFrac: 0.62,
    minRel: 0.45, maxLegs: 3 - safeMatchLegs.length,
    formBonus: 0,
  });
  const safeLegs = [...safeMatchLegs, ...safePlayerLegs].slice(0, 3);

  // ── 2. Doable — Score or Assist ───────────────────────────────────────────
  const doablePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.55, maxHR: 0.78,
    minFrac: 0.35, maxFrac: 0.80,
    minRel: 0.28, maxLegs: 5,
    statFilter: ["scoreOrAssist", "goals", "assists"],
    formBonus: 0.04,
  });
  const doableLegs = [...doableMatchLegs, ...doablePlayerLegs].slice(0, 3);

  // ── 3. Goal Scorers — Anytime Goalscorer ──────────────────────────────────
  const goalLegs = buildPlayerLegs(profiles, {
    minHR: 0.30, maxHR: 0.80,
    minFrac: 0.25, maxFrac: 0.75,
    minRel: 0.12, maxLegs: 4,
    statFilter: ["goals"],
    formBonus: 0.03,
  });

  // ── 4. Shots — Player Shots + Shots on Target ────────────────────────────
  const shotLegs = buildPlayerLegs(profiles, {
    minHR: 0.45, maxHR: 0.85,
    minFrac: 0.35, maxFrac: 0.80,
    minRel: 0.22, maxLegs: 4,
    statFilter: ["shots", "shotsOnTarget"],
    formBonus: 0.03,
  });

  // ── 5. Cards — Total Cards + Both Teams to Receive + Player Card ──────────
  const playerCardLegs = buildPlayerLegs(profiles, {
    minHR: 0.20, maxHR: 0.75,
    minFrac: 0.35, maxFrac: 1.0,
    minRel: 0.08, maxLegs: 2,
    statFilter: ["yellowCards"],
    formBonus: 0,
  });
  const cardLegs = [...cardMatchLegs, ...playerCardLegs].slice(0, 4);

  // ── 6. Value — best edge by (avg - threshold) / threshold × reliability ───
  const valueProfiles: { leg: SoccerKitchenLeg; score: number }[] = [];
  for (const prof of profiles) {
    // Skip if stat not a real bookmaker market
    const BETTABLE: SoccerStatKey[] = ["scoreOrAssist","goals","assists","shots","shotsOnTarget","tackles","yellowCards","foulsCommitted","saves"];
    if (!BETTABLE.includes(prof.stat.stat)) continue;

    const found = findThreshold(prof.vals, prof.avg, prof.stat.step, 0.50, 0.82, 0.45, 0.85);
    if (!found) continue;
    const rel  = reliability(found.hitRate, prof.vals.length);
    const edge = prof.avg - found.threshold;
    if (edge <= 0 || rel < 0.18) continue;
    const score = (edge / Math.max(found.threshold, 0.1)) * rel * found.hitRate;
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
        threshold:     found.threshold,
        direction:     "over",
        hitRate:       found.hitRate,
        reliability:   rel,
        avgStat:       Math.round(prof.avg * 100) / 100,
        gamesAnalyzed: prof.vals.length,
        breakdown: [
          `Avg ${prof.avg.toFixed(2)} vs line ${found.threshold} (edge: +${(prof.avg - found.threshold).toFixed(2)})`,
          `Hits in ${Math.round(found.hitRate * 100)}% of games`,
          ...(prof.isOnForm ? [`▲ On form — avg ${prof.recentAvg.toFixed(2)} last 3`] : []),
        ],
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
        edge:          Math.round((prof.avg - found.threshold) * 100) / 100,
      },
    });
  }
  valueProfiles.sort((a, b) => b.score - a.score);

  // Deduplicate by player+stat
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
