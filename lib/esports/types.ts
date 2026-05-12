export type EsportsMatchStatus = "not_started" | "running" | "finished" | "canceled" | "postponed";

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
}

export interface EsportsTeam {
  id: string; // Internal canonical ID (e.g. "cs2.navi")
  externalId: number | string;
  name: string;
  acronym: string;
  imageUrl?: string;
  players?: EsportsPlayer[];
}

export interface EsportsTournament {
  id: string;
  externalId: number | string;
  name: string;
  leagueId: number | string;
  seriesId?: number | string;
  beginAt?: string;
  endAt?: string;
}

export interface EsportsMatch {
  id: string;
  externalId: number | string;
  status: EsportsMatchStatus;
  scheduledAt: string;
  beginAt?: string;
  endAt?: string;
  tournament: EsportsTournament;
  homeTeam: EsportsTeam;
  awayTeam: EsportsTeam;
  winnerId?: string;
  score?: {
    home: number;
    away: number;
  };
  numberOfGames: number;
  gameType: "cs2" | "lol";
  liveUrl?: string;
}

export interface EsportsNormalizationResult<T> {
  data: T;
  raw?: any;
}
