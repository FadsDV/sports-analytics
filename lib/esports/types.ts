export type EsportsMatchStatus = "not_started" | "live" | "paused" | "completed" | "cancelled" | "postponed";

export interface EsportsPlayer {
  id: string; // Internal canonical ID (e.g. "cs2.s1mple")
  externalId: number | string;
  name: string;
  firstName?: string;
  lastName?: string;
  handle: string;
  nationality?: string;
  role?: string;
  imageUrl?: string;
  alias?: string[];
}

export interface EsportsOrganization {
  id: string; // e.g. "org.navi"
  name: string;
  acronym: string;
  region?: string;
}

export interface EsportsTeam {
  id: string; // Internal canonical ID (e.g. "cs2.navi")
  externalId: number | string;
  name: string;
  acronym: string;
  imageUrl?: string;
  players?: EsportsPlayer[];
  orgId?: string;
  region?: string;
}

export interface EsportsTournament {
  id: string;
  externalId: number | string;
  name: string;
  leagueId: number | string;
  seriesId?: number | string;
  leagueName?: string;
  serieName?: string;
  beginAt?: string;
  endAt?: string;
  tier?: string;
  region?: string;
}

export interface EsportsGame {
  id: number;
  status: EsportsMatchStatus;
  beginAt?: string;
  endAt?: string;
  position: number;
  winnerId?: string;
  complete: boolean;
}

export interface CS2Map {
  name: string;
  homeScore: number;
  awayScore: number;
  winnerId?: string;
  completed: boolean;
}

export interface EsportsMatch {
  id: string;
  externalId: number | string;
  status: EsportsMatchStatus;
  scheduledAt: string | null;
  beginAt?: string | null;
  endAt?: string | null;
  tournament: EsportsTournament;
  tournamentStage?: string;
  homeTeam: EsportsTeam | null;
  awayTeam: EsportsTeam | null;
  winnerId?: string;
  score?: {
    home: number;
    away: number;
  };
  numberOfGames: number; // e.g. 1 for bo1, 3 for bo3
  matchType?: "best_of" | "all_games_played";
  gameType: "cs2" | "lol";
  liveUrl?: string;
  games?: EsportsGame[];
  maps?: CS2Map[]; // CS2 specific
}

export interface EsportsNormalizationResult<T> {
  data: T;
  raw?: any;
}
