/**
 * Soccer Kitchen — slip generator for soccer matches.
 *
 * Slip types:
 *   safe        — high-probability match/team legs (BTTS, over 1.5 goals, etc.)
 *   doable      — solid player legs at moderate thresholds (65–78% hit rate)
 *   goalscorers — player goal legs only (Kane 1+, Olise 1+, etc.)
 *   creators    — player assist / key-pass legs
 *   cards       — yellow card legs for players + match total cards
 *   value       — best edge picks by (avgStat - threshold) / threshold
 *
 * Data sources:
 *   - Team legs:   ESPN TeamHistoryGame scores (home/away splits)
 *   - Player legs: Sofascore recent game logs (goals, assists, shots, cards, etc.)
 */

import type { TeamHistoryGame } from "@/lib/sports/espn";
import type { SofascoreGameLog, SofascoreTeamStats } from "@/lib/sports/sofascore";

// ─── Public types ─────────────────────────────────────────────────────────────

export type SoccerStatKey =
  | "goals" | "assists" | "shots" | "shotsOnTarget"
  | "keyPasses" | "yellowCards" | "xG";

export type SoccerLegType = "player" | "team" | "match";

export type SoccerSlipType =
  | "safe" | "doable" | "goalscorers" | "creators" | "cards" | "value";

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
  stat:          SoccerStatKey | "teamGoals" | "matchGoals" | "btts" | "totalCards" | "teamCards";
  statLabel:     string;
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
  position:  string;   // "G", "D", "M", "F"
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
  homeHistory:   TeamHistoryGame[];   // ESPN home-game history for home team
  awayHistory:   TeamHistoryGame[];   // ESPN away-game history for away team
  homeTeamStats: SofascoreTeamStats | null;
  awayTeamStats: SofascoreTeamStats | null;
  players:       SoccerPlayerProfile[];
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function hitRate(vals: number[], threshold: number): number {
  return vals.length ? vals.filter(v => v >= threshold).length / vals.length : 0;
}

/** Parse "3-1" → [3, 1]. Returns null on failure. */
function parseScore(score: string | null): [number, number] | null {
  if (!score) return null;
  const m = score.match(/(\d+)\D+(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2])];
}

function reliability(hr: number, n: number): number {
  // Simple reliability: hit rate × sample factor (ramp from 0 at n=3 to 1 at n=10)
  const sampleFactor = Math.min(1, (n - 2) / 8);
  return Math.round(hr * sampleFactor * 100) / 100;
}

function snapThreshold(raw: number, step: number): number {
  return Math.round(raw / step) * step;
}

/**
 * Find the highest threshold within [minFrac*avg, maxFrac*avg] that still
 * achieves hitRate between minHR and maxHR.
 */
function findThreshold(
  vals: number[], avg: number, step: number,
  minHR: number, maxHR: number,
  minFrac: number, maxFrac: number,
): { threshold: number; hitRate: number } | null {
  const minThr = Math.max(step, snapThreshold(avg * minFrac, step));
  const maxThr = snapThreshold(avg * maxFrac, step);
  let best: { threshold: number; hitRate: number } | null = null;
  for (let t = minThr; t <= maxThr + step / 2; t += step) {
    const thr = snapThreshold(t, step);
    const hr  = hitRate(vals, thr);
    if (hr >= minHR && hr <= maxHR) {
      if (!best || thr > best.threshold) best = { threshold: thr, hitRate: hr };
    }
  }
  return best;
}

// ─── Team / match leg builders ────────────────────────────────────────────────

function buildTeamGoalLegs(input: SoccerKitchenInput): SoccerKitchenLeg[] {
  const legs: SoccerKitchenLeg[] = [];

  // Home team goals scored (from ESPN home game history)
  const homeGoalsFor: number[] = [];
  const homeGoalsAgainst: number[] = [];
  for (const g of input.homeHistory) {
    const parsed = parseScore(g.score);
    if (!parsed) continue;
    const [hs, as_] = g.homeAway === "home" ? parsed : [parsed[1], parsed[0]];
    homeGoalsFor.push(hs);
    homeGoalsAgainst.push(as_);
  }

  const awayGoalsFor: number[] = [];
  const awayGoalsAgainst: number[] = [];
  for (const g of input.awayHistory) {
    const parsed = parseScore(g.score);
    if (!parsed) continue;
    const [hs, as_] = g.homeAway === "away" ? [parsed[1], parsed[0]] : parsed;
    awayGoalsFor.push(hs);
    awayGoalsAgainst.push(as_);
  }

  // Home team goals
  if (homeGoalsFor.length >= 3) {
    const avg = mean(homeGoalsFor);
    if (avg >= 0.8) {
      for (const [minHR, maxHR, minF, maxF] of [
        [0.78, 1.0, 0.35, 0.65],  // safe zone
        [0.62, 0.80, 0.65, 0.90], // doable zone
      ] as [number, number, number, number][]) {
        const found = findThreshold(homeGoalsFor, avg, 0.5, minHR, maxHR, minF, maxF);
        if (found) {
          const rel = reliability(found.hitRate, homeGoalsFor.length);
          const recent3 = homeGoalsFor.slice(-3);
          const recentAvg = mean(recent3);
          legs.push({
            legType: "team",
            teamName: input.homeTeamName,
            teamAbbr: input.homeAbbr,
            side: "home",
            stat: "teamGoals",
            statLabel: "Goals",
            threshold: found.threshold,
            direction: "over",
            hitRate: found.hitRate,
            reliability: rel,
            avgStat: Math.round(avg * 10) / 10,
            gamesAnalyzed: homeGoalsFor.length,
            breakdown: [
              `Avg ${avg.toFixed(1)} goals/game at home`,
              `Hit ${found.threshold}+ in ${Math.round(found.hitRate * 100)}% of home games`,
            ],
            isOnForm: recentAvg >= avg * 1.1,
            isBounceBack: homeGoalsFor[homeGoalsFor.length - 1] === 0 && avg >= 1.5,
          });
          break; // one team-goals leg per team
        }
      }
    }
  }

  // Away team goals
  if (awayGoalsFor.length >= 3) {
    const avg = mean(awayGoalsFor);
    if (avg >= 0.7) {
      for (const [minHR, maxHR, minF, maxF] of [
        [0.72, 1.0, 0.30, 0.60],
        [0.58, 0.75, 0.60, 0.88],
      ] as [number, number, number, number][]) {
        const found = findThreshold(awayGoalsFor, avg, 0.5, minHR, maxHR, minF, maxF);
        if (found) {
          const rel = reliability(found.hitRate, awayGoalsFor.length);
          const recent3 = awayGoalsFor.slice(-3);
          const recentAvg = mean(recent3);
          legs.push({
            legType: "team",
            teamName: input.awayTeamName,
            teamAbbr: input.awayAbbr,
            side: "away",
            stat: "teamGoals",
            statLabel: "Goals",
            threshold: found.threshold,
            direction: "over",
            hitRate: found.hitRate,
            reliability: rel,
            avgStat: Math.round(avg * 10) / 10,
            gamesAnalyzed: awayGoalsFor.length,
            breakdown: [
              `Avg ${avg.toFixed(1)} goals/game away`,
              `Hit ${found.threshold}+ in ${Math.round(found.hitRate * 100)}% of away games`,
            ],
            isOnForm: recentAvg >= avg * 1.1,
            isBounceBack: awayGoalsFor[awayGoalsFor.length - 1] === 0 && avg >= 1.2,
          });
          break;
        }
      }
    }
  }

  // BTTS — both teams to score
  const bttsGames = Math.min(homeGoalsFor.length, awayGoalsFor.length);
  if (bttsGames >= 3) {
    // home scored AND away scored
    const homeScoredRate = homeGoalsFor.filter(g => g >= 1).length / homeGoalsFor.length;
    const awayScoredRate = awayGoalsFor.filter(g => g >= 1).length / awayGoalsFor.length;
    const bttsProbability = homeScoredRate * awayScoredRate;
    if (bttsProbability >= 0.55) {
      legs.push({
        legType: "match",
        stat: "btts",
        statLabel: "Both Teams to Score",
        threshold: 1,
        direction: "over",
        hitRate: bttsProbability,
        reliability: reliability(bttsProbability, bttsGames),
        avgStat: 0,
        gamesAnalyzed: bttsGames,
        breakdown: [
          `${input.homeAbbr} scored in ${Math.round(homeScoredRate * 100)}% of home games`,
          `${input.awayAbbr} scored in ${Math.round(awayScoredRate * 100)}% of away games`,
        ],
        isOnForm: false,
        isBounceBack: false,
      });
    }
  }

  // Match total goals over 2.5
  if (homeGoalsFor.length >= 3 && awayGoalsFor.length >= 3) {
    const homeAvg = mean(homeGoalsFor) + mean(homeGoalsAgainst);
    const awayAvg = mean(awayGoalsFor) + mean(awayGoalsAgainst);
    const matchAvg = (homeAvg + awayAvg) / 2;
    for (const thr of [2.5, 1.5]) {
      const homeOver = homeGoalsFor.filter((g, i) => g + (homeGoalsAgainst[i] ?? 0) > thr).length / homeGoalsFor.length;
      const awayOver = awayGoalsFor.filter((g, i) => g + (awayGoalsAgainst[i] ?? 0) > thr).length / awayGoalsFor.length;
      const combinedRate = (homeOver + awayOver) / 2;
      if (combinedRate >= 0.60) {
        legs.push({
          legType: "match",
          stat: "matchGoals",
          statLabel: `Over ${thr} Goals`,
          threshold: thr,
          direction: "over",
          hitRate: combinedRate,
          reliability: reliability(combinedRate, Math.min(homeGoalsFor.length, awayGoalsFor.length)),
          avgStat: Math.round(matchAvg * 10) / 10,
          gamesAnalyzed: Math.min(homeGoalsFor.length, awayGoalsFor.length),
          breakdown: [
            `${input.homeAbbr} home games: ${Math.round(homeOver * 100)}% over ${thr}`,
            `${input.awayAbbr} away games: ${Math.round(awayOver * 100)}% over ${thr}`,
            `Match avg: ${matchAvg.toFixed(1)} total goals`,
          ],
          isOnForm: false,
          isBounceBack: false,
        });
        break;
      }
    }
  }

  return legs;
}

function buildCardLegs(input: SoccerKitchenInput): SoccerKitchenLeg[] {
  const legs: SoccerKitchenLeg[] = [];

  // Team-level card rates from Sofascore season stats
  const homeAvgCards = input.homeTeamStats && input.homeTeamStats.matches > 0
    ? (input.homeTeamStats.yellowCards ?? 0) / input.homeTeamStats.matches
    : null;
  const awayAvgCards = input.awayTeamStats && input.awayTeamStats.matches > 0
    ? (input.awayTeamStats.yellowCards ?? 0) / input.awayTeamStats.matches
    : null;

  if (homeAvgCards !== null && awayAvgCards !== null) {
    const matchAvgCards = homeAvgCards + awayAvgCards;
    for (const thr of [3.5, 2.5]) {
      // Rough hit rate based on Poisson-like estimate
      const estHR = thr < matchAvgCards * 0.85 ? 0.72 :
                    thr < matchAvgCards * 1.0   ? 0.58 : 0.44;
      if (estHR >= 0.58) {
        legs.push({
          legType: "match",
          stat: "totalCards",
          statLabel: `Total Yellow Cards Over ${thr}`,
          threshold: thr,
          direction: "over",
          hitRate: estHR,
          reliability: reliability(estHR, Math.max(input.homeTeamStats?.matches ?? 5, 5)),
          avgStat: Math.round(matchAvgCards * 10) / 10,
          gamesAnalyzed: Math.min(input.homeTeamStats?.matches ?? 10, 30),
          breakdown: [
            `${input.homeAbbr} avg ${homeAvgCards.toFixed(1)} yellows/game`,
            `${input.awayAbbr} avg ${awayAvgCards.toFixed(1)} yellows/game`,
            `Combined avg: ${matchAvgCards.toFixed(1)}/game`,
          ],
          isOnForm: false,
          isBounceBack: false,
        });
        break;
      }
    }
  }

  return legs;
}

// ─── Player leg builder ───────────────────────────────────────────────────────

interface PlayerStatConfig {
  key:     keyof SofascoreGameLog;
  stat:    SoccerStatKey;
  label:   string;
  step:    number;
  minAvg:  number;
}

const PLAYER_STATS: PlayerStatConfig[] = [
  { key: "goals",         stat: "goals",         label: "Goals",          step: 0.5, minAvg: 0.20 },
  { key: "assists",       stat: "assists",        label: "Assists",        step: 0.5, minAvg: 0.18 },
  { key: "shots",         stat: "shots",          label: "Shots",          step: 0.5, minAvg: 1.0  },
  { key: "shotsOnTarget", stat: "shotsOnTarget",  label: "Shots on Target",step: 0.5, minAvg: 0.5  },
  { key: "keyPasses",     stat: "keyPasses",      label: "Key Passes",     step: 0.5, minAvg: 0.8  },
  { key: "yellowCards",   stat: "yellowCards",    label: "Yellow Card",    step: 0.5, minAvg: 0.15 },
  { key: "xG",            stat: "xG",             label: "xG",             step: 0.1, minAvg: 0.15 },
];

interface PlayerProfile {
  player:  SoccerPlayerProfile;
  stat:    PlayerStatConfig;
  vals:    number[];
  avg:     number;
  recentAvg: number;
  isOnForm: boolean;
  isBounceBack: boolean;
}

function buildPlayerProfiles(players: SoccerPlayerProfile[]): PlayerProfile[] {
  const profiles: PlayerProfile[] = [];

  for (const p of players) {
    if (p.games.length < 3) continue;

    for (const sc of PLAYER_STATS) {
      const vals = p.games
        .map(g => {
          const v = g[sc.key as keyof SofascoreGameLog];
          return typeof v === "number" ? v : null;
        })
        .filter((v): v is number => v !== null);

      if (vals.length < 3) continue;
      const avg = mean(vals);
      if (avg < sc.minAvg) continue;

      const recent3   = vals.slice(-3);
      const recentAvg = mean(recent3);
      const isOnForm  = recent3.length >= 3 && recentAvg >= avg * 1.10;
      const last      = vals[vals.length - 1] ?? 0;
      const isBounceBack = last < avg * 0.5 && avg >= sc.minAvg * 2;

      profiles.push({ player: p, stat: sc, vals, avg, recentAvg, isOnForm, isBounceBack });
    }
  }

  return profiles;
}

interface TierConfig {
  minHR:      number;
  maxHR:      number;
  minFrac:    number;
  maxFrac:    number;
  minRel:     number;
  maxLegs:    number;
  statFilter?: SoccerStatKey[];
  formBonus:  number;
}

function buildPlayerLegs(
  profiles: PlayerProfile[],
  tier: TierConfig,
  exclude: Set<string> = new Set(),
): SoccerKitchenLeg[] {
  const candidates: { leg: SoccerKitchenLeg; rel: number }[] = [];

  for (const prof of profiles) {
    if (tier.statFilter && !tier.statFilter.includes(prof.stat.stat)) continue;

    const base = tier.formBonus > 0 && prof.isOnForm && prof.recentAvg > prof.avg
      ? prof.recentAvg : prof.avg;

    const found = findThreshold(
      prof.vals, base, prof.stat.step,
      tier.minHR, tier.maxHR,
      tier.minFrac, tier.maxFrac,
    );
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
          ...(prof.isOnForm ? [`On form: avg ${prof.recentAvg.toFixed(2)} last 3 games`] : []),
          ...(prof.isBounceBack ? ["Due for bounce-back"] : []),
        ],
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
      },
    });
  }

  candidates.sort((a, b) => b.rel - a.rel);

  const legs: SoccerKitchenLeg[] = [];
  const playerStat = new Map<string, number>();

  for (const { leg } of candidates) {
    if (legs.length >= tier.maxLegs) break;
    const pk = `${leg.player}|${leg.stat}`;
    if ((playerStat.get(pk) ?? 0) >= 1) continue; // max 1 same stat per player
    const pc = `${leg.player}`;
    if ((playerStat.get(pc) ?? 0) >= 2) continue;  // max 2 different stats per player

    legs.push(leg);
    playerStat.set(pk, (playerStat.get(pk) ?? 0) + 1);
    playerStat.set(pc, (playerStat.get(pc) ?? 0) + 1);
  }

  return legs;
}

function buildCardPlayerLegs(profiles: PlayerProfile[]): SoccerKitchenLeg[] {
  return buildPlayerLegs(profiles, {
    minHR: 0.28, maxHR: 0.80,
    minFrac: 0.4, maxFrac: 1.0,
    minRel: 0.10,
    maxLegs: 3,
    statFilter: ["yellowCards"],
    formBonus: 0,
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeSoccerKitchen(input: SoccerKitchenInput): SoccerKitchenSlip[] {
  const profiles = buildPlayerProfiles(input.players);
  const teamLegs = buildTeamGoalLegs(input);
  const cardMatchLegs = buildCardLegs(input);

  // Safe slip: best high-confidence legs from team + match + reliable player picks
  const safeTeamLegs = teamLegs.filter(l => l.hitRate >= 0.72).slice(0, 2);
  const safePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.72, maxHR: 1.0,
    minFrac: 0.30, maxFrac: 0.65,
    minRel: 0.45,
    maxLegs: 3 - safeTeamLegs.length,
    formBonus: 0,
  });
  const safeLegs = [...safeTeamLegs, ...safePlayerLegs].slice(0, 3);
  const safeKeys = new Set(safeLegs.map(l => `${l.player ?? l.teamName}|${l.stat}|${l.threshold}`));

  // Doable slip: player legs at 60–75% hit rate
  const doablePlayerLegs = buildPlayerLegs(profiles, {
    minHR: 0.60, maxHR: 0.78,
    minFrac: 0.55, maxFrac: 0.88,
    minRel: 0.32,
    maxLegs: 5,
    formBonus: 0.04,
  }, safeKeys);
  const doableTeamLegs = teamLegs
    .filter(l => l.hitRate >= 0.60 && l.hitRate < 0.72)
    .filter(l => !safeKeys.has(`${l.teamName}|${l.stat}|${l.threshold}`))
    .slice(0, 2);
  const doableLegs = [...doableTeamLegs, ...doablePlayerLegs].slice(0, 3);

  // Goal scorers: player goals only
  const goalLegs = buildPlayerLegs(profiles, {
    minHR: 0.35, maxHR: 0.78,
    minFrac: 0.25, maxFrac: 0.75,
    minRel: 0.15,
    maxLegs: 4,
    statFilter: ["goals"],
    formBonus: 0.03,
  });

  // Creators: assists + key passes
  const creatorLegs = buildPlayerLegs(profiles, {
    minHR: 0.38, maxHR: 0.80,
    minFrac: 0.28, maxFrac: 0.80,
    minRel: 0.15,
    maxLegs: 4,
    statFilter: ["assists", "keyPasses"],
    formBonus: 0.03,
  });

  // Cards: match total cards + player yellow cards
  const playerCardLegs = buildCardPlayerLegs(profiles);
  const cardLegs = [...cardMatchLegs, ...playerCardLegs].slice(0, 4);

  // Value: best by (avg - threshold) / threshold across all player stats
  const valueProfiles: { leg: SoccerKitchenLeg; score: number }[] = [];
  for (const prof of profiles) {
    const found = findThreshold(
      prof.vals, prof.avg, prof.stat.step,
      0.55, 0.80,
      0.50, 0.85,
    );
    if (!found) continue;
    const rel  = reliability(found.hitRate, prof.vals.length);
    const edge = prof.avg - found.threshold;
    if (edge <= 0 || rel < 0.20) continue;
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
          `Avg ${prof.avg.toFixed(2)} vs line ${found.threshold}`,
          `Edge: +${edge.toFixed(2)} above threshold`,
          `Hits in ${Math.round(found.hitRate * 100)}% of games`,
        ],
        isOnForm:      prof.isOnForm,
        isBounceBack:  prof.isBounceBack,
        edge:          Math.round(edge * 100) / 100,
      },
    });
  }
  valueProfiles.sort((a, b) => b.score - a.score);
  const valueLegs = valueProfiles.slice(0, 8).map(v => v.leg);

  return [
    { type: "safe",        legs: safeLegs },
    { type: "doable",      legs: doableLegs },
    { type: "goalscorers", legs: goalLegs },
    { type: "creators",    legs: creatorLegs },
    { type: "cards",       legs: cardLegs },
    { type: "value",       legs: valueLegs },
  ];
}
