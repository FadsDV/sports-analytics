export type NBASeasonType = "regular" | "playoffs" | "playin" | "preseason";

export interface NBAPlayerGame {
  gameId:     string | null;
  date:       string;           // "YYYY-MM-DD"
  season:     number;           // ESPN season year (year playoffs end in)
  seasonType: NBASeasonType | null;
  opponent:   string;
  homeAway:   "home" | "away";
  result:     "W" | "L" | null;
  teamScore:  number | null;
  oppScore:   number | null;
  minutes:    number | null;
  points:     number | null;
  rebounds:   number | null;
  assists:    number | null;
  steals:     number | null;
  blocks:     number | null;
  turnovers:  number | null;
  fgm:        number | null;
  fga:        number | null;
  fgPct:      number | null;    // 0-100
  fg3m:       number | null;
  fg3a:       number | null;
  fg3Pct:     number | null;    // 0-100
  ftm:        number | null;
  fta:        number | null;
  ftPct:      number | null;    // 0-100
}

export interface NBAStatLine {
  gamesCount: number;
  ppg:        number;
  rpg:        number;
  apg:        number;
  spg:        number;
  bpg:        number;
  topg:       number;
  mpg:        number;
  fgPct:      number;           // 0-100
  fg3Pct:     number;           // 0-100
  ftPct:      number;           // 0-100
}

export type NBADataContext = "current" | "limited" | "historical";

export interface NBAPlayerAnalyticsResult {
  playerId:        string;
  playerName:      string;
  position:        string;
  jersey?:         string;
  headshot?:       string;
  matchContext:    "home" | "away";
  opponent:        string;
  fullSeasonGames: NBAPlayerGame[];
  seasonAvg:       NBAStatLine;
  last5:           NBAPlayerGame[];
  last10:          NBAPlayerGame[];
  last5Avg:        NBAStatLine | null;
  last10Avg:       NBAStatLine | null;
  vsOpponent: {
    games:         NBAPlayerGame[];
    avg:           NBAStatLine | null;
    lastMatchup?:  NBAPlayerGame;
  };
  homeAvg:         NBAStatLine | null;
  awayAvg:         NBAStatLine | null;
  pointsTrend:     (number | null)[];
  reboundsTrend:   (number | null)[];
  assistsTrend:    (number | null)[];
  fgPctTrend:      (number | null)[];
  injuryContext?:  { status: string; note: string };
  // Multi-season context
  currentSeasonCount: number;
  dataContext:        NBADataContext;
  seasonsIncluded:    number[];
}
