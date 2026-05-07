/**
 * AFL match analytics precomputation layer.
 * All derived stats are computed here, not in UI components.
 * Cache revalidation is handled at the fetch layer.
 */

import type { H2HGame } from "@/lib/types";
import type { MatchHistoryItem } from "@/lib/sports/history";
import type { ESPNInjury } from "@/lib/sports/espnPlayers";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface AFLRecentGame {
  gameId:    string;
  date:      string;        // "YYYY-MM-DD"
  opponent:  string;
  oppAbbr:   string;        // 3-char abbreviation
  result:    "W" | "L" | "D";
  teamScore: number;
  oppScore:  number;
  margin:    number;        // positive = win, negative = loss
  homeAway:  "H" | "A";
  venue:     string;
}

export interface AFLTeamAnalytics {
  form:          ("W" | "L" | "D")[];  // last 5 results
  record:        { wins: number; losses: number; draws: number };
  homeRecord:    { wins: number; losses: number };
  awayRecord:    { wins: number; losses: number };
  venueRecord:   { wins: number; losses: number } | null;  // at match venue
  avgScored:     number;
  avgConceded:   number;
  avgMarginWin:  number;    // avg margin in wins
  avgMarginLoss: number;    // avg margin in losses
  streak:        { type: "W" | "L" | "D" | null; count: number };
  last5:         AFLRecentGame[];
  daysRest:      number | null;
  injuryImpact:  { out: ESPNInjury[]; doubtful: ESPNInjury[]; suspended: ESPNInjury[] };
}

export interface AFLMeeting {
  gameId?:  string;
  date:     string;
  home:     string;
  away:     string;
  score:    string;         // "88–72"
  winner:   string;         // team name or "Draw"
  margin:   number;
  venue?:   string;
}

export interface AFLH2HSummary {
  homeWins:  number;
  awayWins:  number;
  draws:     number;
  total:     number;
  streak:    { team: string; count: number } | null;  // current H2H winning streak
  meetings:  AFLMeeting[];
}

export interface AFLMatchAnalytics {
  home:             AFLTeamAnalytics;
  away:             AFLTeamAnalytics;
  predictedMargin:  number | null;    // + = home team wins by this much
  h2h:              AFLH2HSummary;
}

// ─── Team name → abbreviation ─────────────────────────────────────────────────

const AFL_ABBR: Record<string, string> = {
  "Adelaide Crows":         "ADL",
  "Brisbane Lions":         "BRL",
  "Carlton":                "CAR",
  "Collingwood":            "COL",
  "Essendon":               "ESS",
  "Fremantle":              "FRE",
  "Geelong Cats":           "GEE",
  "Gold Coast Suns":        "GCS",
  "Greater Western Sydney": "GWS",
  "Hawthorn":               "HAW",
  "Melbourne":              "MEL",
  "North Melbourne":        "NTH",
  "Port Adelaide":          "PAD",
  "Richmond":               "RIC",
  "St Kilda":               "STK",
  "Sydney Swans":           "SYD",
  "West Coast Eagles":      "WCE",
  "Western Bulldogs":       "WBD",
};

function abbr(name: string): string {
  if (AFL_ABBR[name]) return AFL_ABBR[name];
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? name.slice(0, 3).toUpperCase()
    : words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
}

// ─── History → analytics ──────────────────────────────────────────────────────

function parseScore(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return [parts[0], parts[1]];
}

function computeTeamAnalytics(
  history:   MatchHistoryItem[],
  venue:     string,
  kickoff:   string,
  injuries:  ESPNInjury[],
): AFLTeamAnalytics {
  // Only use finished games with a result
  const games = history.filter(g => g.result != null).slice(0, 20);

  // Form (last 5)
  const form = games.slice(0, 5).map(g => g.result as "W" | "L" | "D");

  // Overall record
  const wins   = games.filter(g => g.result === "W").length;
  const losses = games.filter(g => g.result === "L").length;
  const draws  = games.filter(g => g.result === "D").length;

  // Home / away splits
  const homeGames = games.filter(g => g.homeAway === "home");
  const awayGames = games.filter(g => g.homeAway === "away");
  const homeWins  = homeGames.filter(g => g.result === "W").length;
  const awayWins  = awayGames.filter(g => g.result === "W").length;

  // Avg scored / conceded
  const scored: number[]   = [];
  const conceded: number[] = [];
  const winMargins: number[]  = [];
  const lossMargins: number[] = [];

  for (const g of games) {
    const sc = parseScore(g.score);
    if (!sc) continue;
    scored.push(sc[0]);
    conceded.push(sc[1]);
    if (g.result === "W") winMargins.push(sc[0] - sc[1]);
    if (g.result === "L") lossMargins.push(sc[1] - sc[0]);
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  // Venue record — match at same venue (first word match)
  const venueKey = venue.toLowerCase().split(/[^a-z]/)[0];
  const venueGames = venueKey.length > 3
    ? games.filter(g => g.venue.toLowerCase().includes(venueKey))
    : [];
  const venueRecord = venueGames.length > 0
    ? { wins: venueGames.filter(g => g.result === "W").length, losses: venueGames.filter(g => g.result === "L").length }
    : null;

  // Current streak
  let streakType: "W" | "L" | "D" | null = null;
  let streakCount = 0;
  for (const g of games) {
    if (streakType === null) { streakType = g.result as "W" | "L" | "D"; streakCount = 1; }
    else if (g.result === streakType) streakCount++;
    else break;
  }

  // Last 5 detailed
  const last5: AFLRecentGame[] = games.slice(0, 5).map(g => {
    const sc = parseScore(g.score);
    return {
      gameId:    g.gameId,
      date:      g.date,
      opponent:  g.opponent,
      oppAbbr:   abbr(g.opponent),
      result:    (g.result ?? "L") as "W" | "L" | "D",
      teamScore: sc?.[0] ?? 0,
      oppScore:  sc?.[1] ?? 0,
      margin:    sc ? sc[0] - sc[1] : 0,
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

  // Injury buckets
  const injuryImpact = {
    out:       injuries.filter(i => i.status === "Out"),
    doubtful:  injuries.filter(i => ["Doubtful", "Questionable"].includes(i.status)),
    suspended: injuries.filter(i => i.status === "Suspended"),
  };

  return {
    form,
    record:        { wins, losses, draws },
    homeRecord:    { wins: homeWins,  losses: homeGames.length - homeWins  },
    awayRecord:    { wins: awayWins,  losses: awayGames.length - awayWins  },
    venueRecord,
    avgScored:     avg(scored),
    avgConceded:   avg(conceded),
    avgMarginWin:  avg(winMargins),
    avgMarginLoss: avg(lossMargins),
    streak:        { type: streakType, count: streakCount },
    last5,
    daysRest,
    injuryImpact,
  };
}

// ─── H2H ──────────────────────────────────────────────────────────────────────

function computeH2H(
  h2h:          H2HGame[],
  homeTeamName: string,
  awayTeamName: string,
): AFLH2HSummary {
  const homeWins = h2h.filter(g => g.winner === homeTeamName).length;
  const draws    = h2h.filter(g => g.winner === "Draw").length;
  const awayWins = h2h.length - homeWins - draws;

  // H2H winning streak (most recent consecutive wins by one side)
  let streakTeam: string | null = null;
  let streakCount = 0;
  for (const g of h2h) {
    if (g.winner === "Draw") break;
    if (streakTeam === null) { streakTeam = g.winner; streakCount = 1; }
    else if (g.winner === streakTeam) streakCount++;
    else break;
  }

  const meetings: AFLMeeting[] = h2h.slice(0, 6).map(g => {
    const parts = g.score.split("-").map(Number);
    const homeScore = parts[0] ?? 0;
    const awayScore = parts[1] ?? 0;
    const winnerIsHome = g.winner === g.homeTeam;
    return {
      gameId: g.gameId,
      date:   g.date,
      home:   g.homeTeam,
      away:   g.awayTeam,
      score:  `${homeScore}–${awayScore}`,
      winner: g.winner,
      margin: Math.abs(homeScore - awayScore),
      venue:  g.venue,
    };
  });

  return {
    homeWins, awayWins, draws,
    total: h2h.length,
    streak: streakTeam && streakCount >= 2
      ? { team: streakTeam, count: streakCount }
      : null,
    meetings,
  };
}

// ─── Predicted margin ─────────────────────────────────────────────────────────

function computePredictedMargin(home: AFLTeamAnalytics, away: AFLTeamAnalytics): number | null {
  if (home.avgScored === 0 && away.avgScored === 0) return null;
  // Expected scores based on each team's attack vs opponent's defence
  const homeExpected = (home.avgScored + (home.avgScored - away.avgConceded)) / 2;
  const awayExpected = (away.avgScored + (away.avgScored - home.avgConceded)) / 2;
  const raw = homeExpected - awayExpected + 5; // +5 home ground advantage
  return Math.round(raw);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeAFLMatchAnalytics(params: {
  homeHistory:  MatchHistoryItem[];
  awayHistory:  MatchHistoryItem[];
  homeInjuries: ESPNInjury[];
  awayInjuries: ESPNInjury[];
  venue:        string;
  kickoff:      string;
  h2h:          H2HGame[];
  homeTeamName: string;
  awayTeamName: string;
}): AFLMatchAnalytics {
  const { homeHistory, awayHistory, homeInjuries, awayInjuries, venue, kickoff, h2h, homeTeamName, awayTeamName } = params;

  const home = computeTeamAnalytics(homeHistory, venue, kickoff, homeInjuries);
  const away = computeTeamAnalytics(awayHistory, venue, kickoff, awayInjuries);

  return {
    home,
    away,
    predictedMargin: computePredictedMargin(home, away),
    h2h: computeH2H(h2h, homeTeamName, awayTeamName),
  };
}
