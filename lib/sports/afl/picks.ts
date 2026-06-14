/**
 * AFL player pick generation.
 * Analyses last-5 game box scores per player and produces reliability-ranked
 * OVER / UNDER props. Also derives value picks when a key opponent is absent.
 */

import type { AFLGamePlayerStats } from "@/lib/sports/espn";
import type { ESPNInjury } from "@/lib/sports/espnPlayers";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AFLPickStat = "D" | "G" | "M" | "T" | "HO" | "K" | "H";

export interface AFLPlayerPick {
  player:        string;
  side:          "home" | "away";
  teamAbbr:      string;
  stat:          AFLPickStat;
  statLabel:     string;
  direction:     "over" | "under";
  threshold:     number;
  hitRate:       number;   // 0–1
  avgStat:       number;
  gamesAnalyzed: number;
  confidence:    "high" | "medium" | "low";
  isValue:       boolean;
  valueNote?:    string;  // "avg +8 disp without Zorko"
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const STAT_LABELS: Record<AFLPickStat, string> = {
  D:  "disposals",
  G:  "goals",
  M:  "marks",
  T:  "tackles",
  HO: "hitouts",
  K:  "kicks",
  H:  "handballs",
};

const STAT_WEIGHTS: Record<AFLPickStat, number> = {
  D:  1.0,   // most popular bet
  G:  0.95,
  M:  0.75,
  T:  0.70,
  HO: 0.60,
  K:  0.80,  // Dabble-specific, very popular
  H:  0.75,
};

// Minimum average needed to even generate a pick for each stat
const MIN_AVG: Record<AFLPickStat, number> = { D: 12, G: 0.4, M: 3, T: 3, HO: 4, K: 5, H: 4 };

// Step size for threshold search
const STEP: Record<AFLPickStat, number> = { D: 1, G: 0.5, M: 1, T: 1, HO: 2, K: 1, H: 1 };

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

function hitRate(vals: number[], threshold: number, direction: "over" | "under"): number {
  if (!vals.length) return 0;
  const hits = vals.filter(v => direction === "over" ? v >= threshold : v <= threshold);
  return hits.length / vals.length;
}

function confidence(hr: number, games: number): "high" | "medium" | "low" {
  if (hr >= 0.80 && games >= 4) return "high";
  if (hr >= 0.70 && games >= 3) return "medium";
  return "low";
}

// ─── Per-player history builder ───────────────────────────────────────────────

interface PlayerHistory {
  name: string;
  side: "home" | "away";
  teamAbbr: string;
  games: Array<Record<AFLPickStat, number>>;
}

function buildPlayerHistories(
  gamesByGame: AFLGamePlayerStats[][],
  teamId: string,
  side: "home" | "away",
  teamAbbr: string,
): PlayerHistory[] {
  const map = new Map<string, PlayerHistory>();

  for (const gamePlayers of gamesByGame) {
    // Match by teamId — the team may be home or away in each historical game
    const teamPlayers = gamePlayers.filter(p => p.teamId === teamId);
    for (const p of teamPlayers) {
      if (!map.has(p.name)) {
        map.set(p.name, { name: p.name, side, teamAbbr, games: [] });
      }
      map.get(p.name)!.games.push({ D: p.D, G: p.G, M: p.M, T: p.T, HO: p.HO, K: p.K, H: p.H });
    }
  }

  return Array.from(map.values()).filter(h => h.games.length >= 3);
}

// ─── Pick generation for one player ──────────────────────────────────────────

function picksForPlayer(h: PlayerHistory): AFLPlayerPick[] {
  const picks: AFLPlayerPick[] = [];
  const STATS: AFLPickStat[] = ["D", "G", "M", "T", "HO", "K", "H"];

  for (const stat of STATS) {
    const vals = h.games.map(g => g[stat]);
    const avg  = mean(vals);
    if (avg < MIN_AVG[stat]) continue;

    const sd  = stddev(vals);
    const step = STEP[stat];

    // ── OVER search: highest threshold with hit rate ≥ 70%, must be ≥ 75% of avg ──
    let bestOverHR = 0;
    let bestOverThreshold = 0;
    const minOverThr = stat === "G" ? avg * 0.5 : Math.round(avg * 0.75);
    const overStart = Math.max(step, minOverThr);
    for (let thr = overStart; thr <= avg + 0.5 * sd; thr += step) {
      const thr2 = stat === "G" ? Math.round(thr * 2) / 2 : Math.round(thr);
      const hr   = hitRate(vals, thr2, "over");
      if (hr >= 0.70 && thr2 > bestOverThreshold) {
        bestOverHR = hr;
        bestOverThreshold = thr2;
      }
    }

    // ── UNDER: only for genuinely low-variance players where avg - threshold is small ──
    // Skip under picks — OVER picks are more intuitive and bookmaker-relevant
    // (Under picks added back via value logic only)

    if (bestOverThreshold > 0 && bestOverHR >= 0.70) {
      picks.push({
        player: h.name, side: h.side, teamAbbr: h.teamAbbr,
        stat, statLabel: STAT_LABELS[stat],
        direction: "over",
        threshold: bestOverThreshold,
        hitRate: bestOverHR,
        avgStat: Math.round(avg * 10) / 10,
        gamesAnalyzed: h.games.length,
        confidence: confidence(bestOverHR, h.games.length),
        isValue: false,
      });
    }
  }

  return picks;
}

// ─── Reliability score for ranking ───────────────────────────────────────────

function pickScore(p: AFLPlayerPick): number {
  const gamesWeight   = Math.min(p.gamesAnalyzed / 5, 1);
  const statImportance = STAT_WEIGHTS[p.stat];
  const valueBonus    = p.isValue ? 0.1 : 0;
  const hrBonus       = p.hitRate >= 0.80 ? 0.05 : 0;
  return p.hitRate * gamesWeight * statImportance + valueBonus + hrBonus;
}

// ─── Value picks — detect player absences ─────────────────────────────────────

function computeValuePicks(
  gamesByGame: AFLGamePlayerStats[][],
  injuredOut: ESPNInjury[],
  benefitTeamId: string,
  benefitSide: "home" | "away",
  teamAbbr: string,
  injuredTeamId: string,
): AFLPlayerPick[] {
  const valuePicks: AFLPlayerPick[] = [];

  for (const injured of injuredOut) {
    const injName = injured.playerName.toLowerCase();

    // Find which historical games the injured player is absent from (not in box score)
    const withGames: AFLGamePlayerStats[][] = [];
    const withoutGames: AFLGamePlayerStats[][] = [];

    for (const gamePlayers of gamesByGame) {
      const injTeamPlayers = gamePlayers.filter(p => p.teamId === injuredTeamId);
      const played = injTeamPlayers.some(p => p.name.toLowerCase().includes(injName) || injName.includes(p.name.toLowerCase().split(" ").pop()!));
      if (played) withGames.push(gamePlayers);
      else         withoutGames.push(gamePlayers);
    }

    if (withoutGames.length === 0 || withGames.length === 0) continue;

    const playerNames = Array.from(new Set(gamesByGame.flatMap(g => g.filter(p => p.teamId === benefitTeamId).map(p => p.name))));
    for (const name of playerNames) {
      const getStats = (games: AFLGamePlayerStats[][]) =>
        games.flatMap(g => g.filter(p => p.teamId === benefitTeamId && p.name === name));

      const withStats    = getStats(withGames);
      const withoutStats = getStats(withoutGames);
      if (!withStats.length || !withoutStats.length) continue;

      const STATS: AFLPickStat[] = ["D", "G", "M", "T"];
      for (const stat of STATS) {
        const withAvg    = mean(withStats.map(p => p[stat]));
        const withoutAvg = mean(withoutStats.map(p => p[stat]));
        const delta      = withoutAvg - withAvg;
        const minDelta   = stat === "D" ? 5 : stat === "G" ? 0.5 : 2;
        if (delta < minDelta) continue;
        if (withoutAvg < MIN_AVG[stat]) continue;

        // Generate an OVER pick based on without-Zorko average
        const threshold = stat === "G"
          ? Math.round((withoutAvg - 0.5) * 2) / 2
          : Math.round(withoutAvg - 2);
        if (threshold <= 0) continue;

        const hr = hitRate(withoutStats.map(p => p[stat]), threshold, "over");
        if (hr < 0.65) continue;

        valuePicks.push({
          player: name, side: benefitSide, teamAbbr,
          stat, statLabel: STAT_LABELS[stat],
          direction: "over",
          threshold,
          hitRate: hr,
          avgStat: Math.round(withoutAvg * 10) / 10,
          gamesAnalyzed: withoutStats.length,
          confidence: confidence(hr, withoutStats.length),
          isValue: true,
          valueNote: `avg +${Math.round(delta)} ${STAT_LABELS[stat]} without ${injured.playerName.split(" ").pop()}`,
        });
      }
    }
  }

  return valuePicks;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeAFLPlayerPicks(params: {
  homeGames:    AFLGamePlayerStats[][];
  awayGames:    AFLGamePlayerStats[][];
  homeTeamId:   string;
  awayTeamId:   string;
  homeAbbr:     string;
  awayAbbr:     string;
  homeInjuries: ESPNInjury[];
  awayInjuries: ESPNInjury[];
}): AFLPlayerPick[] {
  const { homeGames, awayGames, homeTeamId, awayTeamId, homeAbbr, awayAbbr, homeInjuries, awayInjuries } = params;

  const homeHistories = buildPlayerHistories(homeGames, homeTeamId, "home", homeAbbr);
  const awayHistories = buildPlayerHistories(awayGames, awayTeamId, "away", awayAbbr);

  const allPicks: AFLPlayerPick[] = [];
  for (const h of [...homeHistories, ...awayHistories]) {
    allPicks.push(...picksForPlayer(h));
  }

  // Value picks — away injuries benefit home players and vice versa
  const awayOut = awayInjuries.filter(i => i.status === "Out");
  const homeOut = homeInjuries.filter(i => i.status === "Out");

  if (awayOut.length > 0) {
    allPicks.push(...computeValuePicks(homeGames, awayOut, homeTeamId, "home", homeAbbr, awayTeamId));
  }
  if (homeOut.length > 0) {
    allPicks.push(...computeValuePicks(awayGames, homeOut, awayTeamId, "away", awayAbbr, homeTeamId));
  }

  // Deduplicate: one pick per player per stat — key on lastName+stat only
  // (omit side to handle ESPN name variants and value/regular pick overlap)
  const bestByKey = new Map<string, AFLPlayerPick>();
  for (const p of allPicks) {
    const lastName = p.player.split(" ").pop() ?? p.player;
    const key = `${lastName}|${p.stat}`;
    const existing = bestByKey.get(key);
    if (!existing || pickScore(p) > pickScore(existing)) {
      bestByKey.set(key, p);
    }
  }
  const deduped = Array.from(bestByKey.values());

  return deduped
    .sort((a, b) => pickScore(b) - pickScore(a))
    .slice(0, 10);
}
