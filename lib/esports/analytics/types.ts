/**
 * Output contracts for the esports analytics layer.
 *
 * All types are deterministic — no confidence scores, no AI-generated values.
 * Every field is either directly derived from match data or clearly marked
 * as a ratio/count over an explicit sample size.
 *
 * Designed to be game-agnostic (CS2 + LoL share these contracts).
 */

// ─── Shared ───────────────────────────────────────────────────────────────────

/** Series result from the perspective of one team. */
export type MatchResult = "W" | "L";

// ─── Team Form ────────────────────────────────────────────────────────────────

/** One entry in a team's form strip (one completed match). */
export interface FormEntry {
  matchId:         string;
  date:            string | null;     // ISO or null if not yet known
  opponentId:      string;
  opponentName:    string;
  opponentAcronym: string;
  result:          MatchResult;
  seriesScore: {
    team:     number;                 // maps/games won
    opponent: number;
  };
  tournament:      string;
}

/**
 * Aggregated form summary for a team over a set of recent matches.
 * sampleSize reflects how many completed matches were found in the input.
 */
export interface TeamForm {
  teamId:     string;
  entries:    FormEntry[];            // most recent first, length = sampleSize
  wins:       number;
  losses:     number;
  winRate:    number;                 // wins / sampleSize, 0–1
  streak: {
    type:  MatchResult | null;        // null if no completed matches
    count: number;
  };
  mapsWon:    number;                 // total maps won across all matches
  mapsLost:   number;
  mapWinRate: number;                 // mapsWon / (mapsWon + mapsLost), 0–1
  sampleSize: number;
}

// ─── Map winrates ─────────────────────────────────────────────────────────────

/**
 * Per-map statistics derived from completed maps.
 * Only populated when individual match detail data (games[]) is available.
 */
export interface MapWinrate {
  mapName:        string;
  wins:           number;
  losses:         number;
  totalPlayed:    number;
  winRate:        number;             // wins / totalPlayed, 0–1
  avgScoreFor:    number;             // avg rounds won by team on this map
  avgScoreAgainst: number;            // avg rounds won by opponent on this map
}

// ─── Head to Head ─────────────────────────────────────────────────────────────

/** One H2H meeting entry. */
export interface H2HEntry {
  matchId:    string;
  date:       string | null;
  tournament: string;
  homeTeamId: string;
  awayTeamId: string;
  winnerId:   string | undefined;
  seriesScore: { home: number; away: number };
}

/**
 * Head-to-head summary between two teams.
 * teamAId / teamBId are canonical internal IDs.
 */
export interface HeadToHead {
  teamAId:       string;
  teamBId:       string;
  teamAWins:     number;
  teamBWins:     number;
  total:         number;
  teamAMapWins:  number;
  teamBMapWins:  number;
  entries:       H2HEntry[];          // most recent first
}

// ─── Roster stability ─────────────────────────────────────────────────────────

/** How many recent matches a player appeared in. */
export interface SeenPlayer {
  id:            string;
  handle:        string;
  matchesPlayed: number;
}

/**
 * Roster stability analysis.
 *
 * Compares the current roster (from team data) against player IDs seen across
 * recent match data. Match-embedded rosters are a snapshot at ingest time, not
 * at match time — see data limitations in analytics/index.ts.
 *
 * stabilityScore = unchanged.length / Math.max(currentRoster.length, 1)
 * Range: 0 (full turnover) → 1 (everyone seen in recent matches).
 */
export interface RosterStability {
  teamId:          string;
  currentRoster:   SeenPlayer[];      // all current players, with match appearances
  unchanged:       string[];          // current player IDs seen in ≥1 recent match
  added:           string[];          // current player IDs not seen in any recent match
  removed:         string[];          // player IDs seen in matches but not in current roster
  stabilityScore:  number;            // 0–1
  sampleSize:      number;            // matches examined
}
