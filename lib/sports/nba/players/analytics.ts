import type { NBAPlayerGame, NBAStatLine, NBAPlayerAnalyticsResult, NBADataContext } from "./types";

// ── Averages ──────────────────────────────────────────────────────────────────

function avgNum(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

export function computeStatLine(games: NBAPlayerGame[]): NBAStatLine | null {
  if (games.length === 0) return null;
  return {
    gamesCount: games.length,
    ppg:    avgNum(games.map(g => g.points)),
    rpg:    avgNum(games.map(g => g.rebounds)),
    apg:    avgNum(games.map(g => g.assists)),
    spg:    avgNum(games.map(g => g.steals)),
    bpg:    avgNum(games.map(g => g.blocks)),
    topg:   avgNum(games.map(g => g.turnovers)),
    mpg:    avgNum(games.map(g => g.minutes)),
    fgPct:  avgNum(games.map(g => g.fgPct)),
    fg3Pct: avgNum(games.map(g => g.fg3Pct)),
    ftPct:  avgNum(games.map(g => g.ftPct)),
  };
}

const EMPTY_STAT_LINE: NBAStatLine = {
  gamesCount: 0, ppg: 0, rpg: 0, apg: 0,
  spg: 0, bpg: 0, topg: 0, mpg: 0,
  fgPct: 0, fg3Pct: 0, ftPct: 0,
};

// ── Main export ───────────────────────────────────────────────────────────────

export function computeNBAPlayerAnalytics(params: {
  playerId:        string;
  playerName:      string;
  position:        string;
  jersey?:         string;
  headshot?:       string;
  games:           NBAPlayerGame[];
  seasonsIncluded: number[];
  matchContext:    "home" | "away";
  opponent:        string;
  injuryContext?:  { status: string; note: string };
}): NBAPlayerAnalyticsResult {
  const {
    playerId, playerName, position, jersey, headshot,
    games, seasonsIncluded, matchContext, opponent, injuryContext,
  } = params;

  // ── Season partitioning ───────────────────────────────────────────────────
  const currentEspnSeason  = new Date().getFullYear();
  const currentSeasonGames = games.filter(g => g.season === currentEspnSeason);
  const currentSeasonCount = currentSeasonGames.length;

  // Season avg: current season if available, else historical fallback
  let seasonAvg:   NBAStatLine;
  let dataContext: NBADataContext;

  if (currentSeasonCount >= 5) {
    seasonAvg   = computeStatLine(currentSeasonGames)!;
    dataContext  = "current";
  } else if (currentSeasonCount > 0) {
    seasonAvg   = computeStatLine(currentSeasonGames)!;
    dataContext  = "limited";
  } else if (games.length > 0) {
    seasonAvg   = computeStatLine(games) ?? EMPTY_STAT_LINE;
    dataContext  = "historical";
  } else {
    seasonAvg   = EMPTY_STAT_LINE;
    dataContext  = "limited";
  }

  // Analytics source: current season if available, else all games
  const analyticsGames = currentSeasonCount > 0 ? currentSeasonGames : games;

  // ── Rolling windows (newest-first from all games) ─────────────────────────
  const last5  = games.slice(0, 5);
  const last10 = games.slice(0, 10);

  // ── vs Opponent (all seasons) ─────────────────────────────────────────────
  const opponentLower  = opponent.toLowerCase();
  const vsOpponentGames = games.filter(
    g => g.opponent.toLowerCase().includes(opponentLower)
  );
  const lastMatchup = vsOpponentGames[0];

  // ── Home / Away splits ────────────────────────────────────────────────────
  const homeGames = analyticsGames.filter(g => g.homeAway === "home");
  const awayGames = analyticsGames.filter(g => g.homeAway === "away");

  // ── Trends: last 10 oldest→newest for sparklines ─────────────────────────
  const trendGames = analyticsGames.slice(0, 10).reverse();

  return {
    playerId,
    playerName,
    position,
    jersey,
    headshot,
    matchContext,
    opponent,
    fullSeasonGames: games,
    seasonAvg,
    last5,
    last10,
    last5Avg:  computeStatLine(last5),
    last10Avg: computeStatLine(last10),
    vsOpponent: {
      games:       vsOpponentGames,
      avg:         computeStatLine(vsOpponentGames),
      lastMatchup,
    },
    homeAvg:      computeStatLine(homeGames),
    awayAvg:      computeStatLine(awayGames),
    pointsTrend:  trendGames.map(g => g.points),
    reboundsTrend: trendGames.map(g => g.rebounds),
    assistsTrend:  trendGames.map(g => g.assists),
    fgPctTrend:    trendGames.map(g => g.fgPct),
    injuryContext,
    currentSeasonCount,
    dataContext,
    seasonsIncluded,
  };
}
