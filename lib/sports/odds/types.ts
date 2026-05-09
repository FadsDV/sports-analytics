import { Sport } from "@/lib/types";

export type MarketType = "h2h" | "spread" | "total";

export interface OddsSelection {
  name: string;        // "Collingwood", "Over 165.5", "-6.5"
  price: number;       // Decimal odds (e.g., 1.91)
  points?: number;     // Spread or Total value (e.g., -6.5 or 165.5)
  outcomeId?: string;  // Unique ID for the specific outcome if provided by bookie
}

export interface OddsMarket {
  type: MarketType;
  lastUpdate: string;  // ISO timestamp
  selections: OddsSelection[];
}

export interface BookmakerOdds {
  key: string;         // "sportsbet", "tab", "bet365"
  title: string;       // "Sportsbet", "TAB", "bet365"
  markets: OddsMarket[];
}

export interface GameOdds {
  gameId: string;
  sport: Sport;
  lastUpdate: string;
  bookmakers: BookmakerOdds[];
}

export interface OddsEdge {
  marketType: MarketType;
  selectionName: string;
  bookmakerKey: string;
  impliedProb: number;      // 1 / price
  estimatedProb: number;    // From our models/analytics
  edge: number;             // estimatedProb - impliedProb
  expectedValue: number;    // (estimatedProb * price) - 1
  isValue: boolean;         // True if expectedValue > threshold
}
