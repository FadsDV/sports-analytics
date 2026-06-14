/**
 * Confidence tier labels and colors.
 * Used by Kitchen, PlayerDrawer, player pages, and any future slip builder.
 * Single source of truth — no duplicated label systems.
 */

export type ConfidenceTier = "elite" | "high" | "strong" | "risky" | "longshot";

/**
 * Map a 0–1 reliability score to a confidence tier.
 *
 * elite    ≥ 0.85  — Near-certain. Hits in almost every game.
 * high     ≥ 0.70  — Very reliable. Should hit most of the time.
 * strong   ≥ 0.55  — Reliable pick with some variance.
 * risky    ≥ 0.38  — Possible but uncertain. Use in multis carefully.
 * longshot  < 0.38  — Bold pick. Low probability, high reward.
 */
export function getConfidenceTier(reliability: number): ConfidenceTier {
  if (reliability >= 0.85) return "elite";
  if (reliability >= 0.70) return "high";
  if (reliability >= 0.55) return "strong";
  if (reliability >= 0.38) return "risky";
  return "longshot";
}

export const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  elite:    "Elite",
  high:     "High",
  strong:   "Strong",
  risky:    "Risky",
  longshot: "Long Shot",
};

/** Tailwind class sets per tier */
export const CONFIDENCE_COLORS: Record<ConfidenceTier, {
  text:   string;
  bg:     string;
  border: string;
  bar:    string;
}> = {
  elite:    { text: "text-[#22C55E]", bg: "bg-[#22C55E]/10", border: "border-[#22C55E]/30", bar: "bg-[#22C55E]"   },
  high:     { text: "text-[#60A5FA]", bg: "bg-[#60A5FA]/10", border: "border-[#60A5FA]/30", bar: "bg-[#60A5FA]"   },
  strong:   { text: "text-[#14B8A6]", bg: "bg-[#14B8A6]/10", border: "border-[#14B8A6]/30", bar: "bg-[#14B8A6]"   },
  risky:    { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30", bar: "bg-[#F59E0B]"   },
  longshot: { text: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30", bar: "bg-[#EF4444]"   },
};

/** Single hex color for inline styles (e.g. bar width, icon tinting). */
export const CONFIDENCE_HEX: Record<ConfidenceTier, string> = {
  elite:    "#22C55E",
  high:     "#60A5FA",
  strong:   "#14B8A6",
  risky:    "#F59E0B",
  longshot: "#EF4444",
};
