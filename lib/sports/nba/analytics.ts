/**
 * NBA match analytics precomputation layer.
 * All derived stats are computed here from real schedule/history data.
 * No fabricated predictions or confidence scores.
 */

import type { TeamHistoryGame } from "@/lib/sports/espn";
import type { ESPNInjury } from "@/lib/sports/espnPlayers";
import type { H2HGame } from "@/lib/types";

// ─── Season stats (from ESPN team API) ────────────────────────────────────────

export interface NBASeasonStats {
  ppg:      number | null;
  oppPpg:   number | null;
  fgPct:    number | null;
  threePct: number | null;
  ftPct:    number | null;
  rpg:      number | null;
  apg:      number | null;
  tpg:      number | null;
  spg:      number | null;
  bpg:      number | null;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface NBARecentGame {
  gameId:    string;
  date:      string;
  opponent:  string;
  oppAbbr:   string;
  result:    "W" | "L";
  teamScore: number;
  oppScore:  number;
  margin:    number;
  homeAway:  "H" | "A";
}

export interface NBATeamAnalytics {
  form5:         ("W" | "L")[];
  form10:        ("W" | "L")[];
  record:        { wins: number; losses: number };
  homeRecord:    { wins: number; losses: number };
  awayRecord:    { wins: number; losses: number };
  streak:        { type: "W" | "L" | null; count: number };
  winRate:       number;           // 0–100
  avgScored:     number;
  avgConceded:   number;
  avgMarginWin:  number;
  avgMarginLoss: number;
  last5:         NBARecentGame[];
  daysRest:      number | null;
  isBackToBack:  boolean;
  injuryImpact:  { out: ESPNInjury[]; doubtful: ESPNInjury[]; questionable: ESPNInjury[] };
  seasonStats:   NBASeasonStats | null;
}

export interface NBAH2HMeeting {
  gameId?: string;
  date:    string;
  home:    string;
  away:    string;
  score:   string;
  winner:  string;
  margin:  number;
}

export interface NBAH2HSummary {
  homeWins:  number;
  awayWins:  number;
  total:     number;
  avgMargin: number;
  streak:    { team: string; count: number } | null;
  meetings:  NBAH2HMeeting[];
}

export interface NBAMatchAnalytics {
  home:          NBATeamAnalytics;
  away:          NBATeamAnalytics;
  h2h:           NBAH2HSummary;
  restAdvantage: "home" | "away" | "even" | null;
}

// ─── Team name → abbreviation ─────────────────────────────────────────────────

const NBA_ABBR: Record<string, string> = {
  "Atlanta Hawks":          "ATL",
  "Boston Celtics":         "BOS",
  "Brooklyn Nets":          "BKN",
  "Charlotte Hornets":      "CHA",
  "Chicago Bulls":          "CHI",
  "Cleveland Cavaliers":    "CLE",
  "Dallas Mavericks":       "DAL",
  "Denver Nuggets":         "DEN",
  "Detroit Pistons":        "DET",
  "Golden State Warriors":  "GSW",
  "Houston Rockets":        "HOU",
  "Indiana Pacers":         "IND",
  "LA Clippers":            "LAC",
  "Los Angeles Clippers":   "LAC",
  "Los Angeles Lakers":     "LAL",
  "Memphis Grizzlies":      "MEM",
  "Miami Heat":             "MIA",
  "Milwaukee Bucks":        "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans":   "NOP",
  "New York Knicks":        "NYK",
  "Oklahoma City Thunder":  "OKC",
  "Orlando Magic":          "ORL",
  "Philadelphia 76ers":     "PHI",
  "Phoenix Suns":           "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings":       "SAC",
  "San Antonio Spurs":      "SAS",
  "Toronto Raptors":        "TOR",
  "Utah Jazz":              "UTA",
  "Washington Wizards":     "WAS",
};

function abbr(name: string): string {
  if (NBA_ABBR[name]) return NBA_ABBR[name];
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? name.slice(0, 3).toUpperCase()
    : words.map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

// ─── Score parsing ────────────────────────────────────────────────────────────

function parseScore(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return [parts[0], parts[1]];
}

// ─── Team analytics ───────────────────────────────────────────────────────────

function computeTeamAnalytics(
  history:     TeamHistoryGame[],
  kickoff:     string,
  injuries:    ESPNInjury[],
  seasonStats: NBASeasonStats | null,
): NBATeamAnalytics {
  const games = history.filter(g => g.result != null && g.result !== "D").slice(0, 20);

  const form5  = games.slice(0, 5).map(g => g.result as "W" | "L");
  const form10 = games.slice(0, 10).map(g => g.result as "W" | "L");

  const wins   = games.filter(g => g.result === "W").length;
  const losses = games.filter(g => g.result === "L").length;

  const homeGames = games.filter(g => g.homeAway === "home");
  const awayGames = games.filter(g => g.homeAway === "away");
  const homeWins  = homeGames.filter(g => g.result === "W").length;
  const awayWins  = awayGames.filter(g => g.result === "W").length;

  const scored: number[]      = [];
  const conceded: number[]    = [];
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
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : 0;

  let streakType: "W" | "L" | null = null;
  let streakCount = 0;
  for (const g of games) {
    const r = g.result as "W" | "L";
    if (streakType === null) { streakType = r; streakCount = 1; }
    else if (r === streakType) streakCount++;
    else break;
  }

  const total   = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const last5: NBARecentGame[] = games.slice(0, 5).map(g => {
    const sc = parseScore(g.score);
    return {
      gameId:    g.gameId,
      date:      g.date,
      opponent:  g.opponent,
      oppAbbr:   abbr(g.opponent),
      result:    (g.result ?? "L") as "W" | "L",
      teamScore: sc?.[0] ?? 0,
      oppScore:  sc?.[1] ?? 0,
      margin:    sc ? sc[0] - sc[1] : 0,
      homeAway:  g.homeAway === "home" ? "H" : "A",
    };
  });

  const lastGame = games[0];
  const daysRest = lastGame?.date
    ? Math.round(
        (new Date(kickoff).getTime() - new Date(lastGame.date + "T12:00:00Z").getTime())
        / 86_400_000
      )
    : null;

  const isBackToBack = daysRest != null && daysRest <= 1;

  const injuryImpact = {
    out:          injuries.filter(i => i.status === "Out"),
    doubtful:     injuries.filter(i => i.status === "Doubtful"),
    questionable: injuries.filter(i => i.status === "Questionable"),
  };

  return {
    form5,
    form10,
    record:        { wins, losses },
    homeRecord:    { wins: homeWins,  losses: homeGames.length - homeWins  },
    awayRecord:    { wins: awayWins,  losses: awayGames.length - awayWins  },
    streak:        { type: streakType, count: streakCount },
    winRate,
    avgScored:     avg(scored),
    avgConceded:   avg(conceded),
    avgMarginWin:  avg(winMargins),
    avgMarginLoss: avg(lossMargins),
    last5,
    daysRest,
    isBackToBack,
    injuryImpact,
    seasonStats,
  };
}

// ─── H2H ──────────────────────────────────────────────────────────────────────

function computeH2H(
  h2h:          H2HGame[],
  homeTeamName: string,
): NBAH2HSummary {
  const homeWins = h2h.filter(g => g.winner === homeTeamName).length;
  const awayWins = h2h.length - homeWins;

  let streakTeam: string | null = null;
  let streakCount = 0;
  for (const g of h2h) {
    if (streakTeam === null) { streakTeam = g.winner; streakCount = 1; }
    else if (g.winner === streakTeam) streakCount++;
    else break;
  }

  const margins = h2h.map(g => {
    const parts = g.score.split("-").map(Number);
    return Math.abs((parts[0] ?? 0) - (parts[1] ?? 0));
  });
  const avgMargin = margins.length > 0
    ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length)
    : 0;

  const meetings: NBAH2HMeeting[] = h2h.slice(0, 6).map(g => {
    const parts = g.score.split("-").map(Number);
    const hs  = parts[0] ?? 0;
    const as_ = parts[1] ?? 0;
    return {
      gameId: g.gameId,
      date:   g.date,
      home:   g.homeTeam,
      away:   g.awayTeam,
      score:  `${hs}–${as_}`,
      winner: g.winner,
      margin: Math.abs(hs - as_),
    };
  });

  return {
    homeWins, awayWins,
    total: h2h.length,
    avgMargin,
    streak: streakTeam && streakCount >= 2 ? { team: streakTeam, count: streakCount } : null,
    meetings,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeNBAMatchAnalytics(params: {
  homeHistory:     TeamHistoryGame[];
  awayHistory:     TeamHistoryGame[];
  homeInjuries:    ESPNInjury[];
  awayInjuries:    ESPNInjury[];
  kickoff:         string;
  h2h:             H2HGame[];
  homeTeamName:    string;
  awayTeamName:    string;
  homeSeasonStats: NBASeasonStats | null;
  awaySeasonStats: NBASeasonStats | null;
}): NBAMatchAnalytics {
  const {
    homeHistory, awayHistory, homeInjuries, awayInjuries,
    kickoff, h2h, homeTeamName, homeSeasonStats, awaySeasonStats,
  } = params;

  const home = computeTeamAnalytics(homeHistory, kickoff, homeInjuries, homeSeasonStats);
  const away = computeTeamAnalytics(awayHistory, kickoff, awayInjuries, awaySeasonStats);

  const restAdvantage =
    home.daysRest == null || away.daysRest == null ? null :
    home.daysRest === away.daysRest ? "even" :
    home.daysRest > away.daysRest ? "home" : "away";

  return {
    home,
    away,
    h2h:           computeH2H(h2h, homeTeamName),
    restAdvantage: restAdvantage as "home" | "away" | "even" | null,
  };
}
