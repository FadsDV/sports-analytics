/**
 * Odds normalization utilities
 */

import { MarketType } from "./types";

/**
 * Format decimal odds to a consistent string representation if needed
 */
export function formatDecimalOdds(price: number): string {
  return price.toFixed(2);
}

/**
 * Common market mapping to ensure consistency across providers
 */
export function normalizeMarketName(providerMarket: string): MarketType {
  const m = providerMarket.toLowerCase();
  if (m.includes("h2h") || m.includes("moneyline") || m.includes("win")) return "h2h";
  if (m.includes("spread") || m.includes("handicap")) return "spread";
  if (m.includes("total") || m.includes("over/under")) return "totals";
  if (m.includes("outright")) return "outrights";
  return "h2h";
}
