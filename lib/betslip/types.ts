/**
 * Betslip checker — shared types.
 */

// ─── Per-leg types ─────────────────────────────────────────────────────────────

export type LegRating = "SOLID" | "RISKY" | "YIKES";

export type OverallRating = "good" | "risky" | "wtf";

export interface ExtractedLeg {
  playerName:  string;
  team?:       string;
  stat:        string;   // normalised: "disposals" | "goals" | "marks" | "tackles" | "hitouts" | "behinds" | "kicks"
  threshold:   number;
  direction:   "over" | "under";
  odds?:       number;
  rating:      LegRating;
  reason:      string;   // 1-line verdict
  aflContext:  string;   // what Claude knows about this player/stat combo
}

// ─── Full slip verdict ─────────────────────────────────────────────────────────

export interface SlipVerdict {
  legs:          ExtractedLeg[];
  overallRating: OverallRating;
  ratingLabel:   string;  // "Good Slip" | "High Risk" | "WTF who told you this shit"
  summary:       string;  // 2-3 sentence overview
  totalOdds?:    number;
}

// ─── API response shapes ───────────────────────────────────────────────────────

export interface BetSlipAnalyzeResponse {
  ok:      true;
  verdict: SlipVerdict;
}

export interface BetSlipErrorResponse {
  ok:      false;
  error:   string;
}

export type BetSlipApiResponse = BetSlipAnalyzeResponse | BetSlipErrorResponse;
