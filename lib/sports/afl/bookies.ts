/**
 * AFL Bookie Market Rules
 *
 * Defines which stats each bookie supports and what threshold values are valid.
 * Used by the bookie-specific kitchen to snap computed thresholds to real lines.
 *
 * Source: docs/BOOKIES.md (compiled from Bet365 + Dabble screenshots)
 */

import type { AFLPickStat } from "./picks";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookieKey = "bet365" | "dabble";

export interface BookieStatConfig {
  available:  boolean;
  /** Explicit valid lines in ascending order. Threshold will snap to nearest. */
  validLines: number[];
  /** If true, snap DOWN (use floor) instead of nearest — safer bet */
  snapDown?:  boolean;
}

export interface BookieConfig {
  key:         BookieKey;
  label:       string;
  color:       string;       // brand accent colour for UI
  logo:        string;       // emoji or short label
  stats:       Record<AFLPickStat, BookieStatConfig>;
}

// ─── Bet365 ───────────────────────────────────────────────────────────────────

export const BET365: BookieConfig = {
  key:   "bet365",
  label: "Bet365",
  color: "#00A651",  // Bet365 green
  logo:  "365",

  stats: {
    D: {
      available:  true,
      validLines: [10, 15, 20, 25, 30, 35],
      // Snap down → safer: 22 disposals → suggest 20 not 25
      snapDown:   true,
    },
    G: {
      available:  true,
      // 0.5 = "Anytime" (1+ goals), 2, 3 — no 4+ on Bet365
      validLines: [0.5, 2, 3],
      snapDown:   true,
    },
    M: { available: false, validLines: [] },
    T: { available: false, validLines: [] },
    HO: { available: false, validLines: [] },
  },
};

// ─── Dabble ───────────────────────────────────────────────────────────────────

export const DABBLE: BookieConfig = {
  key:   "dabble",
  label: "Dabble",
  color: "#FF6B35",  // Dabble orange
  logo:  "DAB",

  stats: {
    D: {
      available:  true,
      // Dabble disposal ladders start at 15 (not 10 like Bet365)
      validLines: [15, 20, 25, 30],
      snapDown:   true,
    },
    G: {
      available:  true,
      // Dabble has 4+ and 5+ that Bet365 doesn't
      validLines: [0.5, 2, 3, 4, 5],
      snapDown:   true,
    },
    M: {
      available:  true,
      // 2+ through 12+, every integer
      validLines: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      snapDown:   true,
    },
    T: {
      available:  true,
      // 2+ through 11+, every integer
      validLines: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      snapDown:   true,
    },
    HO: {
      // Hitouts not available on either bookie
      available:  false,
      validLines: [],
    },
  },
};

export const BOOKIES: Record<BookieKey, BookieConfig> = {
  bet365: BET365,
  dabble: DABBLE,
};

// ─── Snap logic ───────────────────────────────────────────────────────────────

/**
 * Snap a computed threshold to the nearest valid bookie line.
 *
 * If snapDown is true (default for all bookies), always snap DOWN to the
 * nearest valid line — safer for the punter (e.g. 22 disposals → suggest 20).
 *
 * Returns null if the threshold is below the minimum valid line
 * (meaning no valid market exists for this player on this bookie).
 */
export function snapThreshold(
  threshold:  number,
  stat:       AFLPickStat,
  bookie:     BookieConfig,
): number | null {
  const config = bookie.stats[stat];
  if (!config.available || config.validLines.length === 0) return null;

  const lines = config.validLines;

  if (config.snapDown !== false) {
    // Find the highest valid line that is ≤ computed threshold
    // e.g. threshold=22, validLines=[15,20,25,30] → returns 20
    const floor = [...lines].reverse().find(l => l <= threshold);
    return floor ?? null;  // null if threshold is below minimum (e.g. 12 on Dabble → no 10 line)
  } else {
    // Snap to nearest (round)
    let nearest = lines[0];
    let minDist  = Math.abs(threshold - lines[0]);
    for (const l of lines) {
      const d = Math.abs(threshold - l);
      if (d < minDist) { minDist = d; nearest = l; }
    }
    return nearest;
  }
}

/**
 * Get the display label for a goal threshold on a specific bookie.
 * 0.5 → "Anytime", 2 → "2+", etc.
 */
export function goalLabel(threshold: number): string {
  if (threshold <= 1) return "Anytime";
  return `${threshold}+`;
}
