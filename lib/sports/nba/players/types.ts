export type NBASeasonType = "preseason" | "regular" | "playin" | "playoffs";

export interface NBAPlayerGame {
  gameId:    string;
  date:      string;           // "YYYY-MM-DD"
  season:    number;           // ESPN season year (2025 = 2024-25 season)
  seasonType: NBASeasonType | null;
  opponent:  string;
  homeAway:  "home" | "away";
  result:    "W" | "L" | null;
  teamScore: number | null;
  oppScore:  number | null;
  minutes:   string | null;   // "MM:SS"
  points:    number | null;
  rebounds:  number | null;
  assists:   number | null;
  steals:    number | null;
  blocks:    number | null;
  turnovers: number | null;
  fouls:     number | null;
  plusMinus: number | null;
  fgm:       number | null;
  fga:       number | null;
  fgPct:     number | null;
  fg3m:      number | null;
  fg3a:      number | null;
  fg3Pct:    number | null;
  ftm:       number | null;
  fta:       number | null;
  ftPct:     number | null;
  offReb:    number | null;
  defReb:    number | null;
}

export interface NBAStatLine {
  gamesCount: number;
  points:     number;
  rebounds:   number;
  assists:    number;
  steals:     number;
  blocks:     number;
  turnovers:  number;
  fgPct:      number;
  fg3Pct:     number;
  ftPct:      number;
  minutes:    number;
  plusMinus:  number;
}

export interface NBAMonthGroup {
  label:       string;            // "January 2025", "Playoffs 2025"
  seasonType:  NBASeasonType | null;
  games:       NBAPlayerGame[];
  gamesCount:  number;
  avgPoints:   number;
  avgRebounds: number;
  avgAssists:  number;
}

export interface NBAPlayerAnalyticsResult {
  playerId:        string;
  playerName:      string;
  position:        string;
  jersey?:         string;
  headshot?:       string;
  teamId:          string;
  opponent:        string;
  matchContext:    "home" | "away";
  games:           NBAPlayerGame[];
  seasonsIncluded: number[];
  seasonAvg:       NBAStatLine;
  last5:           NBAPlayerGame[];
  vsOpponent: {
    games:       NBAPlayerGame[];
    avg:         NBAStatLine | null;
    lastMatchup?: NBAPlayerGame;
  };
  homeAvg:        NBAStatLine | null;
  awayAvg:        NBAStatLine | null;
  pointsTrend:    (number | null)[];
  assistsTrend:   (number | null)[];
  reboundsTrend:  (number | null)[];
  monthGroups:    NBAMonthGroup[];
}
