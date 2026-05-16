/**
 * Slip tracking utilities — shared between AFL and NBA.
 *
 * Responsibilities:
 *  1. Build a player-name → slip-type color map (for player stat table indicators)
 *  2. Check whether a kitchen leg has hit against the current box score
 */

import type { BoxScore, BoxScoreRow } from "@/lib/types";

// ─── Color / label per slip type ─────────────────────────────────────────────

export const SLIP_COLORS: Record<string, string> = {
  safe:        "#22C55E",
  doable:      "#60A5FA",
  goalscorers: "#F59E0B",
  scorers:     "#F59E0B",
  disposals:   "#14B8A6",
  playmakers:  "#14B8A6",
  ballsy:      "#EF4444",
  value:       "#A78BFA",
};

export const SLIP_ABBR: Record<string, string> = {
  safe:        "S",
  doable:      "D",
  goalscorers: "G",
  scorers:     "P",
  disposals:   "DI",
  playmakers:  "PL",
  ballsy:      "B",
  value:       "V",
};

// ─── Color map builder ────────────────────────────────────────────────────────

export interface SlipEntry {
  type:  string;
  color: string;
  abbr:  string;
}

/**
 * Returns a Map<playerName, SlipEntry[]> so player stat rows can render
 * coloured dots/badges for every slip they appear in.
 */
export function buildSlipColorMap(
  slips: { type: string; legs: { player: string }[] }[]
): Map<string, SlipEntry[]> {
  const map = new Map<string, SlipEntry[]>();
  for (const slip of slips) {
    const entry: SlipEntry = {
      type:  slip.type,
      color: SLIP_COLORS[slip.type] ?? "#888888",
      abbr:  SLIP_ABBR[slip.type]  ?? slip.type.slice(0, 2).toUpperCase(),
    };
    for (const leg of slip.legs) {
      const existing = map.get(leg.player) ?? [];
      if (!existing.find(e => e.type === slip.type)) {
        map.set(leg.player, [...existing, entry]);
      }
    }
  }
  return map;
}

// ─── Box score lookup ─────────────────────────────────────────────────────────

/**
 * ESPN stat key overrides.
 * Kitchen uses "FG3M" but ESPN box score exposes "3PT".
 */
const STAT_KEY_MAP: Record<string, string> = {
  FG3M: "3PT",
};

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function findRow(playerName: string, rows: BoxScoreRow[]): BoxScoreRow | undefined {
  const norm = normName(playerName);
  // Exact normalised match
  const exact = rows.find(r => normName(r.player) === norm);
  if (exact) return exact;
  // Last-name suffix match (≥ 5 chars)
  const suffix = norm.slice(-7);
  if (suffix.length >= 5) {
    return rows.find(r => normName(r.player).endsWith(suffix));
  }
  return undefined;
}

/**
 * Returns true if the player's current stat in the box score meets the threshold.
 */
export function checkLegHit(
  leg:      { player: string; side: "home" | "away"; stat: string; threshold: number },
  boxScore: BoxScore | null
): boolean {
  if (!boxScore) return false;
  const rows = leg.side === "home" ? boxScore.home : boxScore.away;
  const row  = findRow(leg.player, rows);
  if (!row) return false;
  const key = STAT_KEY_MAP[leg.stat] ?? leg.stat;
  const raw = row.stats[key];
  if (raw == null) return false;
  return Number(raw) >= leg.threshold;
}

/**
 * Returns hit booleans for every leg in a slip.
 */
export function checkSlipHits(
  legs:     { player: string; side: "home" | "away"; stat: string; threshold: number }[],
  boxScore: BoxScore | null
): boolean[] {
  return legs.map(leg => checkLegHit(leg, boxScore));
}

/**
 * Returns the player's current stat value from the box score, or null if unavailable.
 */
export function getLegCurrentValue(
  leg:      { player: string; side: "home" | "away"; stat: string },
  boxScore: BoxScore | null
): number | null {
  if (!boxScore) return null;
  const rows = leg.side === "home" ? boxScore.home : boxScore.away;
  const row  = findRow(leg.player, rows);
  if (!row) return null;
  const key = STAT_KEY_MAP[leg.stat] ?? leg.stat;
  const raw = row.stats[key];
  if (raw == null) return null;
  return Number(raw);
}
