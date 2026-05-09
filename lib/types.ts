export type Sport = "soccer" | "ucl" | "uel" | "laliga" | "bundesliga" | "aleague" | "basketball" | "nfl" | "afl";
export type GameStatus = "upcoming" | "live" | "finished";
export type FormResult = "W" | "L" | "D"; // D only for soccer
export type RiskLevel = "Low" | "Medium" | "High";

export interface Weather {
  condition: string; // e.g. "Clear", "Rain", "Windy"
  tempC: number;
  windKph: number;
  humidity: number;
}

export interface Player {
  name: string;
  position: string;
  stats: Record<string, string | number>; // flexible per sport
  injured: boolean;
  injuryNote?: string;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  draws?: number; // soccer
}

export interface TeamSplit {
  home: TeamRecord;
  away: TeamRecord;
}

export interface H2HGame {
  gameId?: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string; // "2-1"
  venue?: string;
  winner: string; // team name | "Draw"
}

export interface Team {
  name: string;
  shortName: string;
  logo: string;      // emoji fallback
  logoUrl?: string;  // real CDN logo from ESPN
  espnId?: string;   // ESPN team ID for roster/injury lookups
  form: FormResult[]; // last 5, most recent first
  record: TeamRecord;
  splits: TeamSplit;
  players: Player[];
}

export interface BetRisk {
  level: RiskLevel;
  score: number; // 0-100, higher = riskier
  factors: {
    label: string;
    value: string;
    impact: "positive" | "negative" | "neutral";
  }[];
  summary: string;
}

export interface Game {
  id: string;
  sport: Sport;
  status: GameStatus;
  kickoff: string; // ISO string
  venue: string;
  city: string;
  homeTeam: Team;
  awayTeam: Team;
  score?: { home: number; away: number }; // if live/finished
  lineScores?: { home: number[]; away: number[] }; // quarter/period scores for NBA and AFL
  liveMinute?: number; // if live
  weather: Weather;
  h2h: H2HGame[];
  betRisk: BetRisk;
  // box score for finished games
  boxScore?: BoxScore;
  teamStats?: {
    home: Record<string, string | number | null>;
    away: Record<string, string | number | null>;
  };
}

export interface BoxScoreRow {
  player: string;
  stats: Record<string, string | number | null>;
}

export interface BoxScore {
  home: BoxScoreRow[];
  away: BoxScoreRow[];
  statHeaders: string[];
}

export interface Insight {
  icon: string;
  text: string;
}

export interface ProbCard {
  label: string;
  value: number;
  conf: "high" | "medium" | "low";
}
