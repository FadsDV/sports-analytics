/**
 * Normalized cross-sport data models.
 *
 * These types form the sport-agnostic contract between data layers and UI.
 * Sport-specific fields are carried in the `meta` escape hatch rather than
 * polluting the shared types with one-sport concerns.
 *
 * Current coverage: AFL, soccer, basketball, NFL
 * Planned: CS2, League of Legends
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export type SportId =
  | "afl"
  | "soccer"
  | "ucl"
  | "uel"
  | "laliga"
  | "bundesliga"
  | "aleague"
  | "worldcup"
  | "basketball"
  | "nfl"
  | "cs2"
  | "lol";

export type MatchStatusCode =
  | "upcoming"
  | "live"
  | "halftime"
  | "finished"
  | "delayed"
  | "postponed"
  | "cancelled";

export type FormResult = "W" | "L" | "D";

// ─── NormalizedLeague ─────────────────────────────────────────────────────────

export interface NormalizedLeague {
  id:       SportId;
  name:     string;
  logoUrl:  string;
  country?: string;
}

// ─── NormalizedTeam ───────────────────────────────────────────────────────────

export interface NormalizedTeam {
  id:        string;            // ESPN team ID or sport-specific ID
  name:      string;
  shortName: string;
  logoUrl:   string;
  form:      FormResult[];      // last 5, most recent first
  record: {
    wins:   number;
    losses: number;
    draws:  number;
  };
  meta?: Record<string, unknown>; // sport-specific extras (e.g. AFL squad_id)
}

// ─── NormalizedPlayer ─────────────────────────────────────────────────────────

export interface NormalizedPlayer {
  id:          string;
  name:        string;
  headshotUrl: string;
  position?:   string;
  jersey?:     string;
  injured:     boolean;
  injuryNote?: string;
  stats:       Record<string, string | number | null>;
  meta?:       Record<string, unknown>; // e.g. AFL champId, fantasy points
}

// ─── NormalizedMatchState ─────────────────────────────────────────────────────

export interface NormalizedMatchState {
  status:        MatchStatusCode;
  period:        number | null;    // quarter, half, inning, map — sport-dependent
  displayClock:  string | null;    // "14:23", "Q3 5'", etc.
  liveMinute:    number | null;    // cumulative elapsed minutes
  isLive:        boolean;
  isComplete:    boolean;
  shortDetail:   string | null;    // e.g. "Q3 - 14:23" from ESPN
}

// ─── NormalizedOdds ───────────────────────────────────────────────────────────

export interface NormalizedOdds {
  homeWin:    number | null;    // decimal odds, e.g. 1.85
  awayWin:    number | null;
  draw:       number | null;    // null for sports without draws
  provider:   string;
  timestamp:  string;           // ISO
  meta?:      Record<string, unknown>;
}

// ─── NormalizedMatch ──────────────────────────────────────────────────────────

export interface NormalizedMatch {
  id:       string;
  sport:    SportId;
  league:   NormalizedLeague;
  kickoff:  string;             // ISO
  venue:    string;
  city:     string;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  state:    NormalizedMatchState;
  score?: {
    home: number;
    away: number;
  };
  periodScores?: {              // quarter/half scores
    home: number[];
    away: number[];
  };
  odds?:    NormalizedOdds;
  meta?:    Record<string, unknown>;
}
