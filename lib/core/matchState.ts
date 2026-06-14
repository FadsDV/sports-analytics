/**
 * Normalized match state utilities — sport-agnostic.
 *
 * Centralizes status interpretation that was previously duplicated across
 * page.tsx, LiveScorePanel, and GameDetailTabs.
 */

import type { MatchStatusCode, NormalizedMatchState } from "./types";

// ─── Status label ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MatchStatusCode, string> = {
  upcoming:   "Upcoming",
  live:       "LIVE",
  halftime:   "HT",
  finished:   "FT",
  delayed:    "Delayed",
  postponed:  "Postponed",
  cancelled:  "Cancelled",
};

export function getStatusLabel(status: MatchStatusCode): string {
  return STATUS_LABELS[status] ?? "Unknown";
}

// ─── Status colours ───────────────────────────────────────────────────────────

export interface StatusColors {
  text:       string;   // Tailwind text class
  bg:         string;   // Tailwind bg class
  dot:        string;   // dot colour for live indicator
}

export function getStatusColors(status: MatchStatusCode): StatusColors {
  switch (status) {
    case "live":
      return { text: "text-red-400",    bg: "bg-red-500/10",    dot: "bg-red-500" };
    case "halftime":
      return { text: "text-yellow-400", bg: "bg-yellow-500/10", dot: "bg-yellow-500" };
    case "finished":
      return { text: "text-[#9CA3AF]",  bg: "bg-white/5",       dot: "" };
    case "delayed":
    case "postponed":
      return { text: "text-yellow-500", bg: "bg-yellow-500/10", dot: "" };
    case "cancelled":
      return { text: "text-red-500",    bg: "bg-red-500/10",    dot: "" };
    default:
      return { text: "text-[#9CA3AF]",  bg: "bg-white/5",       dot: "" };
  }
}

// ─── State predicates ─────────────────────────────────────────────────────────

export function isMatchLive(status: MatchStatusCode): boolean {
  return status === "live" || status === "halftime";
}

export function isMatchComplete(status: MatchStatusCode): boolean {
  return status === "finished";
}

// ─── Period labels ────────────────────────────────────────────────────────────

export function getPeriodLabel(sport: string, period: number | null): string {
  if (period == null) return "";
  switch (sport) {
    case "afl":
    case "basketball":
      return `Q${period}`;
    case "soccer":
    case "ucl":
    case "uel":
    case "laliga":
    case "bundesliga":
    case "aleague":
    case "worldcup":
      return period <= 1 ? "1H" : period === 2 ? "2H" : "ET";
    case "nfl":
      return period <= 4 ? `Q${period}` : "OT";
    default:
      return `P${period}`;
  }
}

// ─── Match clock ──────────────────────────────────────────────────────────────

/**
 * Formats a display clock string from available state.
 * Prefers shortDetail from ESPN if available.
 */
export function formatMatchClock(params: {
  sport:        string;
  status:       MatchStatusCode;
  period:       number | null;
  liveMinute:   number | null;
  shortDetail:  string | null;
  displayClock: string | null;
}): string {
  const { sport, status, period, liveMinute, shortDetail, displayClock } = params;

  if (status === "halftime") return "HT";
  if (status === "finished") return "FT";
  if (!isMatchLive(status)) return getStatusLabel(status);

  if (displayClock) return displayClock;
  if (shortDetail)  return shortDetail;

  if (liveMinute == null) return "LIVE";

  const periodLabel = getPeriodLabel(sport, period);

  switch (sport) {
    case "afl": {
      const qMin = liveMinute % 20;
      return periodLabel ? `${periodLabel} ${qMin}'` : `${liveMinute}'`;
    }
    case "basketball": {
      return periodLabel || "LIVE";
    }
    default:
      return `${liveMinute}'`;
  }
}

// ─── ESPN status mapper ───────────────────────────────────────────────────────

/**
 * Maps ESPN status state + detail strings to a normalized MatchStatusCode.
 * ESPN states: "pre", "in", "post"
 * ESPN type names: "STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_FINAL", etc.
 */
export function mapESPNStatus(params: {
  state:      string;               // "pre" | "in" | "post"
  typeName?:  string;               // ESPN type.name e.g. "STATUS_FINAL"
  completed?: boolean;
}): MatchStatusCode {
  const { state, typeName, completed } = params;
  const name = typeName?.toUpperCase() ?? "";

  if (name.includes("HALFTIME"))   return "halftime";
  if (name.includes("POSTPONED"))  return "postponed";
  if (name.includes("CANCELLED") || name.includes("CANCELED")) return "cancelled";
  if (name.includes("DELAYED"))    return "delayed";
  if (name.includes("FINAL") || name.includes("COMPLETE") || state === "post" || completed) return "finished";
  if (state === "in")              return "live";
  return "upcoming";
}

// ─── State builder ────────────────────────────────────────────────────────────

/**
 * Constructs a NormalizedMatchState from ESPN event data.
 */
export function buildMatchState(params: {
  espnState:    string;
  espnTypeName?: string;
  completed?:   boolean;
  period?:      number | null;
  displayClock?: string | null;
  shortDetail?:  string | null;
  liveMinute?:   number | null;
}): NormalizedMatchState {
  const status = mapESPNStatus({
    state:     params.espnState,
    typeName:  params.espnTypeName,
    completed: params.completed,
  });

  return {
    status,
    period:       params.period       ?? null,
    displayClock: params.displayClock ?? null,
    liveMinute:   params.liveMinute   ?? null,
    isLive:       isMatchLive(status),
    isComplete:   isMatchComplete(status),
    shortDetail:  params.shortDetail  ?? null,
  };
}
