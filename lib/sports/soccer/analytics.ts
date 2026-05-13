/**
 * Soccer match analytics precomputation layer.
 * All derived stats are computed here, not in UI components.
 */

import type { H2HGame, FormResult } from "@/lib/types";
import type { TeamHistoryGame, VenueFilter } from "@/lib/sports/espn";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface SoccerRecentGame {
  gameId:    string;
  date:      string;        // "YYYY-MM-DD"
  opponent:  string;
  result:    FormResult;
  teamScore: number;
  oppScore:  number;
  homeAway:  "H" | "A";
  venue:     string;
}

export interface SoccerTeamAnalytics {
  form:          FormResult[];  // last 5 results
  record:        { wins: number; losses: number; draws: number };
  homeRecord:    { wins: number; losses: number; draws: number };
  awayRecord:    { wins: number; losses: number; draws: number };
  avgScored:     number;
  avgConceded:   number;
  cleanSheetPct: number;
  streak:        { type: FormResult | null; count: number };
  last5:         SoccerRecentGame[];
  daysRest:      number | null;
  // Advanced (from Sofascore if available)
  xG?:           number;
  xGA?:          number;
  possession?:   number;
  shotsPerGame?: number;
  shotsOnTargetPerGame?: number;
  bigChancesCreated?: number;
  foulsPerGame?: number;
  cardsPerGame?: { yellow: number; red: number };
  cornersPerGame?: number;
}

export interface SoccerMeeting {
  gameId?:  string;
  date:     string;
  home:     string;
  away:     string;
  score:    string;         // "2–1"
  winner:   string;         // team name or "Draw"
  venue?:   string;
}

export interface SoccerH2HSummary {
  homeWins:  number;
  awayWins:  number;
  draws:     number;
  total:     number;
  meetings:  SoccerMeeting[];
}

export interface SoccerMatchAnalytics {
  home:             SoccerTeamAnalytics;
  away:             SoccerTeamAnalytics;
  h2h:              SoccerH2HSummary;
}

// ─── History → analytics ──────────────────────────────────────────────────────

function parseScore(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return [parts[0], parts[1]];
}

function computeTeamAnalytics(
  history:   TeamHistoryGame[],
  kickoff:   string,
): SoccerTeamAnalytics {
  // Only use finished games with a result
  const games = history.filter(g => g.result != null).slice(0, 20);

  // Form (last 5)
  const form = games.slice(0, 5).map(g => g.result as FormResult);

  // Overall record
  const wins   = games.filter(g => g.result === "W").length;
  const losses = games.filter(g => g.result === "L").length;
  const draws  = games.filter(g => g.result === "D").length;

  // Home / away splits
  const homeGames = games.filter(g => g.homeAway === "home");
  const awayGames = games.filter(g => g.homeAway === "away");
  const homeWins  = homeGames.filter(g => g.result === "W").length;
  const homeDraws = homeGames.filter(g => g.result === "D").length;
  const awayWins  = awayGames.filter(g => g.result === "W").length;
  const awayDraws = awayGames.filter(g => g.result === "D").length;

  // Avg scored / conceded
  const scored: number[]   = [];
  const conceded: number[] = [];
  let cleanSheets = 0;

  for (const g of games) {
    const sc = parseScore(g.score);
    if (!sc) continue;
    scored.push(sc[0]);
    conceded.push(sc[1]);
    if (sc[1] === 0) cleanSheets++;
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

  // Current streak
  let streakType: FormResult | null = null;
  let streakCount = 0;
  for (const g of games) {
    if (streakType === null) { streakType = g.result as FormResult; streakCount = 1; }
    else if (g.result === streakType) streakCount++;
    else break;
  }

  // Last 5 detailed
  const last5: SoccerRecentGame[] = games.slice(0, 5).map(g => {
    const sc = parseScore(g.score);
    return {
      gameId:    g.gameId,
      date:      g.date,
      opponent:  g.opponent,
      result:    (g.result ?? "L") as FormResult,
      teamScore: sc?.[0] ?? 0,
      oppScore:  sc?.[1] ?? 0,
      homeAway:  g.homeAway === "home" ? "H" : "A",
      venue:     g.venue,
    };
  });

  // Days rest from last game
  const lastGame = games[0];
  const daysRest = lastGame?.date
    ? Math.round(
        (new Date(kickoff).getTime() - new Date(lastGame.date + "T12:00:00Z").getTime())
        / 86_400_000
      )
    : null;

  return {
    form,
    record:        { wins, losses, draws },
    homeRecord:    { wins: homeWins, losses: homeGames.length - homeWins - homeDraws, draws: homeDraws },
    awayRecord:    { wins: awayWins, losses: awayGames.length - awayWins - awayDraws, draws: awayDraws },
    avgScored:     avg(scored),
    avgConceded:   avg(conceded),
    cleanSheetPct: games.length > 0 ? Math.round((cleanSheets / games.length) * 100) : 0,
    streak:        { type: streakType, count: streakCount },
    last5,
    daysRest,
  };
}

// ─── H2H ──────────────────────────────────────────────────────────────────────

function computeH2H(
  h2h:          H2HGame[],
  homeTeamName: string,
): SoccerH2HSummary {
  const homeWins = h2h.filter(g => g.winner === homeTeamName).length;
  const draws    = h2h.filter(g => g.winner === "Draw").length;
  const awayWins = h2h.length - homeWins - draws;

  const meetings: SoccerMeeting[] = h2h.slice(0, 6).map(g => {
    const parts = g.score.split("-").map(Number);
    const homeScore = parts[0] ?? 0;
    const awayScore = parts[1] ?? 0;
    return {
      gameId: g.gameId,
      date:   g.date,
      home:   g.homeTeam,
      away:   g.awayTeam,
      score:  `${homeScore}–${awayScore}`,
      winner: g.winner,
      venue:  g.venue,
    };
  });

  return {
    homeWins, awayWins, draws,
    total: h2h.length,
    meetings,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeSoccerMatchAnalytics(params: {
  homeHistory:  TeamHistoryGame[];
  awayHistory:  TeamHistoryGame[];
  kickoff:      string;
  h2h:          H2HGame[];
  homeTeamName: string;
  awayTeamName: string;
}): SoccerMatchAnalytics {
  const { homeHistory, awayHistory, kickoff, h2h, homeTeamName } = params;

  const home = computeTeamAnalytics(homeHistory, kickoff);
  const away = computeTeamAnalytics(awayHistory, kickoff);

  return {
    home,
    away,
    h2h: computeH2H(h2h, homeTeamName),
  };
}
