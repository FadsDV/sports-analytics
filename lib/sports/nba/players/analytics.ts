import type {
  NBAPlayerGame,
  NBAStatLine,
  NBAPlayerAnalyticsResult,
  NBAMonthGroup,
  NBASeasonType,
} from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function avgStatLine(games: NBAPlayerGame[]): NBAStatLine | null {
  if (games.length === 0) return null;

  const avg = (key: keyof NBAPlayerGame): number => {
    let total = 0, count = 0;
    for (const g of games) {
      const v = g[key] as number | null;
      if (v != null) { total += v; count++; }
    }
    return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
  };

  const minutesAvg = (): number => {
    let total = 0, count = 0;
    for (const g of games) {
      if (!g.minutes) continue;
      const [m, s] = g.minutes.split(":").map(Number);
      const mins = m + (s ?? 0) / 60;
      if (!isNaN(mins)) { total += mins; count++; }
    }
    return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
  };

  return {
    gamesCount: games.length,
    points:     avg("points"),
    rebounds:   avg("rebounds"),
    assists:    avg("assists"),
    steals:     avg("steals"),
    blocks:     avg("blocks"),
    turnovers:  avg("turnovers"),
    fgPct:      avg("fgPct"),
    fg3Pct:     avg("fg3Pct"),
    ftPct:      avg("ftPct"),
    minutes:    minutesAvg(),
    plusMinus:  avg("plusMinus"),
  };
}

function buildMonthGroups(games: NBAPlayerGame[]): NBAMonthGroup[] {
  const groups = new Map<string, {
    label: string; seasonType: NBASeasonType | null; games: NBAPlayerGame[];
  }>();

  for (const g of games) {
    let key: string;
    let label: string;

    if (g.seasonType === "playoffs") {
      key   = `playoffs-${g.season}`;
      label = `Playoffs ${g.season}`;
    } else if (g.seasonType === "playin") {
      key   = `playin-${g.season}`;
      label = `Play-In ${g.season}`;
    } else {
      const month = Number(g.date.slice(5, 7)) - 1;
      const year  = Number(g.date.slice(0, 4));
      key   = `${year}-${String(month + 1).padStart(2, "0")}`;
      label = `${MONTH_NAMES[month]} ${year}`;
    }

    if (!groups.has(key)) {
      groups.set(key, { label, seasonType: g.seasonType, games: [] });
    }
    groups.get(key)!.games.push(g);
  }

  // Sort: playoffs/playin first (by season desc), then months newest-first
  const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
    const isSpecialA = a.startsWith("playoffs") || a.startsWith("playin");
    const isSpecialB = b.startsWith("playoffs") || b.startsWith("playin");
    if (isSpecialA && !isSpecialB) return -1;
    if (!isSpecialA && isSpecialB) return  1;
    return b.localeCompare(a);
  });

  return sorted.map(([, g]) => {
    const avg = avgStatLine(g.games);
    return {
      label:       g.label,
      seasonType:  g.seasonType,
      games:       g.games,
      gamesCount:  g.games.length,
      avgPoints:   avg?.points   ?? 0,
      avgRebounds: avg?.rebounds ?? 0,
      avgAssists:  avg?.assists  ?? 0,
    };
  });
}

const EMPTY_STAT_LINE: NBAStatLine = {
  gamesCount: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
  turnovers: 0, fgPct: 0, fg3Pct: 0, ftPct: 0, minutes: 0, plusMinus: 0,
};

export function computeNBAPlayerAnalytics(input: {
  playerId:        string;
  playerName:      string;
  position:        string;
  jersey?:         string;
  headshot?:       string;
  teamId:          string;
  games:           NBAPlayerGame[];
  seasonsIncluded: number[];
  matchContext:    "home" | "away";
  opponent:        string;
}): NBAPlayerAnalyticsResult {
  const {
    playerId, playerName, position, jersey, headshot,
    teamId, games, seasonsIncluded, matchContext, opponent,
  } = input;

  const currentSeason      = seasonsIncluded[0] ?? 0;
  const currentSeasonGames = games.filter(g => g.season === currentSeason && g.seasonType !== "preseason");
  const seasonAvg          = avgStatLine(currentSeasonGames) ?? EMPTY_STAT_LINE;

  const last5 = games.filter(g => g.seasonType !== "preseason").slice(0, 5);

  const oppLower  = opponent.toLowerCase();
  const vsGames   = games.filter(g =>
    g.opponent.toLowerCase().includes(oppLower) ||
    oppLower.includes(g.opponent.toLowerCase().split(" ").pop() ?? "")
  );

  const homeGames = currentSeasonGames.filter(g => g.homeAway === "home");
  const awayGames = currentSeasonGames.filter(g => g.homeAway === "away");

  const recentN       = 20;
  const recentGames   = games.filter(g => g.seasonType !== "preseason").slice(0, recentN);
  const pointsTrend   = recentGames.map(g => g.points).reverse();
  const assistsTrend  = recentGames.map(g => g.assists).reverse();
  const reboundsTrend = recentGames.map(g => g.rebounds).reverse();

  const monthGroups = buildMonthGroups(
    games.filter(g => g.seasonType !== "preseason")
  );

  return {
    playerId,
    playerName,
    position,
    jersey,
    headshot,
    teamId,
    opponent,
    matchContext,
    games,
    seasonsIncluded,
    seasonAvg,
    last5,
    vsOpponent: {
      games:       vsGames,
      avg:         avgStatLine(vsGames),
      lastMatchup: vsGames[0],
    },
    homeAvg:       avgStatLine(homeGames),
    awayAvg:       avgStatLine(awayGames),
    pointsTrend,
    assistsTrend,
    reboundsTrend,
    monthGroups,
  };
}
