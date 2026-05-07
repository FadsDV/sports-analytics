export interface AFLPlayerGame {
  gameId: string | null;
  date: string;           // "YYYY-MM-DD"
  season: number;         // 2026, 2025, etc.
  opponent: string;
  homeAway: "home" | "away";
  result: "W" | "L" | "D" | null;
  teamScore: number | null;
  oppScore: number | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  goals: number | null;
  behinds: number | null;
  hitouts: number | null;
  contestedPoss: number | null;
  freesFor: number | null;
  freesAgainst: number | null;
  fantasyScore: number | null;
  raw: Record<string, string | number | null>;
}

export interface AFLStatLine {
  disposals: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  goals: number;
  behinds: number;
  hitouts: number;
  fantasyScore: number;
  gamesCount: number;
}

export interface AFLPlayerAnalyticsResult {
  playerId: string;
  playerName: string;
  position: string;
  jersey?: string;
  headshot?: string;
  matchContext: "home" | "away";
  opponent: string;
  contextGames: AFLPlayerGame[];
  seasonAvg: AFLStatLine;
  last5Context: AFLPlayerGame[];
  vsOpponent: { games: AFLPlayerGame[]; avg: AFLStatLine | null };
  homeAvg: AFLStatLine | null;
  awayAvg: AFLStatLine | null;
  disposalTrend: (number | null)[];
  goalTrend: (number | null)[];
  tackleTrend: (number | null)[];
  fantasyTrend: (number | null)[];
}
