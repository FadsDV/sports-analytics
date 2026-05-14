/**
 * Normalized esports data models — sport-agnostic contract between data layer and UI.
 *
 * Frontend components consume ONLY these types.
 * Provider schemas (PandaScore, etc.) are confined to lib/sports/{game}/client.ts.
 */

export type EsportsMatchStatus =
  | "not_started"
  | "live"
  | "paused"
  | "completed"
  | "cancelled"
  | "postponed";

// ─── Player ───────────────────────────────────────────────────────────────────

export interface EsportsPlayer {
  id:           string;               // canonical e.g. "cs2.s1mple"
  externalId:   number | string;
  name:         string;
  firstName?:   string;
  lastName?:    string;
  handle:       string;               // in-game name
  nationality?: string;
  role?:        string;
  imageUrl?:    string;
  alias?:       string[];
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export interface EsportsOrganization {
  id:      string;
  name:    string;
  acronym: string;
  region?: string;
}

export interface EsportsTeam {
  id:         string;                 // canonical e.g. "cs2.navi"
  externalId: number | string;
  name:       string;
  acronym:    string;
  imageUrl?:  string;
  players?:   EsportsPlayer[];
  orgId?:     string;
  region?:    string;
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface EsportsTournament {
  id:          string;
  externalId:  number | string;
  name:        string;
  leagueId:    number | string;
  seriesId?:   number | string;
  leagueName?: string;
  serieName?:  string;
  tier?:       string;
  region?:     string;
  beginAt?:    string;
  endAt?:      string;
}

// ─── CS2-specific: individual map result ──────────────────────────────────────

export interface CS2Map {
  name:      string;
  homeScore: number;
  awayScore: number;
  winnerId?: string;                  // canonical team ID
  completed: boolean;
}

// ─── Game (individual game within a match series) ─────────────────────────────

export interface EsportsGame {
  id:        number;
  status:    EsportsMatchStatus;
  beginAt?:  string;
  endAt?:    string;
  position:  number;
  winnerId?: string;
  complete:  boolean;
}

// ─── Match ────────────────────────────────────────────────────────────────────

export interface EsportsMatch {
  id:             string;             // canonical e.g. "cs2.match.12345"
  externalId:     number | string;
  status:         EsportsMatchStatus;
  scheduledAt:    string | null;
  beginAt?:       string | null;
  endAt?:         string | null;
  tournament:     EsportsTournament;
  tournamentStage?: string;
  homeTeam:       EsportsTeam | null; // null = TBD
  awayTeam:       EsportsTeam | null;
  winnerId?:      string;
  score?:         { home: number; away: number };
  numberOfGames:  number;             // Bo1=1, Bo3=3, Bo5=5
  matchType?:     "best_of" | "all_games_played";
  gameType:       "cs2" | "lol";
  liveUrl?:       string;
  games?:         EsportsGame[];
  maps?:          CS2Map[];
}

// ─── Normalization utility ────────────────────────────────────────────────────

export interface EsportsNormalizationResult<T> {
  data: T;
  raw?: any;
}
