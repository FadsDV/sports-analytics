import type { AFLPlayerGame, AFLStatLine, AFLPlayerAnalyticsResult } from "./types";

function avgNum(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

export function avgStatLine(games: AFLPlayerGame[]): AFLStatLine | null {
  if (games.length === 0) return null;
  return {
    disposals: avgNum(games.map((g) => g.disposals)),
    kicks: avgNum(games.map((g) => g.kicks)),
    handballs: avgNum(games.map((g) => g.handballs)),
    marks: avgNum(games.map((g) => g.marks)),
    tackles: avgNum(games.map((g) => g.tackles)),
    goals: avgNum(games.map((g) => g.goals)),
    behinds: avgNum(games.map((g) => g.behinds)),
    hitouts: avgNum(games.map((g) => g.hitouts)),
    fantasyScore: avgNum(games.map((g) => g.fantasyScore)),
    gamesCount: games.length,
  };
}

export function computeAFLPlayerAnalytics(params: {
  playerId: string;
  playerName: string;
  position: string;
  jersey?: string;
  headshot?: string;
  games: AFLPlayerGame[];
  matchContext: "home" | "away";
  opponent: string;
  seasons: number[];
}): AFLPlayerAnalyticsResult {
  const { playerId, playerName, position, jersey, headshot, games, matchContext, opponent, seasons } = params;

  // Filter to the requested seasons
  const seasonSet = new Set(seasons);
  const filteredGames = games.filter((g) => seasonSet.has(g.season));

  // Context games: matching home/away, sorted newest first
  const contextGames = filteredGames
    .filter((g) => g.homeAway === matchContext)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Season average from context games
  const seasonAvg = avgStatLine(contextGames) ?? {
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    goals: 0,
    behinds: 0,
    hitouts: 0,
    fantasyScore: 0,
    gamesCount: 0,
  };

  // Last 5 context games
  const last5Context = contextGames.slice(0, 5);

  // vs Opponent: all filtered games where opponent name matches (case-insensitive)
  const opponentLower = opponent.toLowerCase();
  const vsOpponentGames = filteredGames.filter((g) =>
    g.opponent.toLowerCase().includes(opponentLower)
  );
  const vsOpponent = {
    games: vsOpponentGames,
    avg: avgStatLine(vsOpponentGames),
  };

  // Home / Away averages from all filtered games
  const homeGames = filteredGames.filter((g) => g.homeAway === "home");
  const awayGames = filteredGames.filter((g) => g.homeAway === "away");
  const homeAvg = avgStatLine(homeGames);
  const awayAvg = avgStatLine(awayGames);

  // Trend arrays: last 10 contextGames, oldest to newest
  const trendGames = contextGames.slice(0, 10).reverse();
  const disposalTrend = trendGames.map((g) => g.disposals);
  const goalTrend = trendGames.map((g) => g.goals);
  const tackleTrend = trendGames.map((g) => g.tackles);
  const fantasyTrend = trendGames.map((g) => g.fantasyScore);

  return {
    playerId,
    playerName,
    position,
    jersey,
    headshot,
    matchContext,
    opponent,
    contextGames,
    seasonAvg,
    last5Context,
    vsOpponent,
    homeAvg,
    awayAvg,
    disposalTrend,
    goalTrend,
    tackleTrend,
    fantasyTrend,
  };
}
