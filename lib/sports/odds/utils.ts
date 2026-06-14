import { OddsMarket, OddsSelection, OddsEdge } from "./types";

/**
 * Converts decimal odds to implied probability (0.0 to 1.0)
 */
export function impliedProbability(price: number): number {
  if (price <= 0) return 0;
  return 1 / price;
}

/**
 * Calculates the vig (margin) of a market
 */
export function calculateVig(market: OddsMarket): number {
  const sum = market.selections.reduce((acc, sel) => acc + impliedProbability(sel.price), 0);
  return sum - 1;
}

/**
 * Removes vig from a market to get "fair" probabilities
 */
export function fairProbabilities(market: OddsMarket): number[] {
  const implieds = market.selections.map(s => impliedProbability(s.price));
  const sum = implieds.reduce((a, b) => a + b, 0);
  if (sum === 0) return implieds;
  return implieds.map(p => p / sum);
}

/**
 * Calculates edge and expected value (EV)
 */
export function calculateEdge(
  price: number,
  estimatedProb: number,
  threshold: number = 0.05
): { edge: number; ev: number; isValue: boolean } {
  const implied = impliedProbability(price);
  const edge = estimatedProb - implied;
  const ev = (estimatedProb * price) - 1;
  
  return {
    edge,
    ev,
    isValue: ev >= threshold
  };
}

/**
 * Helper to find the best odds for a selection across multiple bookmakers
 */
export function findBestOdds(
  markets: { bookmakerKey: string; market: OddsMarket }[],
  selectionName: string
): { bookmakerKey: string; selection: OddsSelection } | null {
  let best: { bookmakerKey: string; selection: OddsSelection } | null = null;
  
  for (const item of markets) {
    const found = item.market.selections.find(s => s.name === selectionName);
    if (found && (!best || found.price > best.selection.price)) {
      best = { bookmakerKey: item.bookmakerKey, selection: found };
    }
  }
  
  return best;
}
