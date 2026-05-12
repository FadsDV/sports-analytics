import { Sport } from "@/lib/types";

export type MarketType = "h2h" | "spread" | "totals" | "outrights";

export interface OddsOutcome {
  id: string;          // Unique ID for this outcome
  name: string;        // "Collingwood", "Over 165.5", "-6.5"
  price: number;       // Decimal odds (e.g., 1.91)
  point?: number;      // Spread or Total value (e.g., -6.5 or 165.5)
  description?: string; // Optional description
}

export interface OddsMarket {
  id: string;
  key: MarketType;
  lastUpdate: string;  // ISO timestamp
  outcomes: OddsOutcome[];
}

export interface BookmakerOdds {
  id: string;
  key: string;         // "sportsbet", "tab", "bet365"
  title: string;       // "Sportsbet", "TAB", "bet365"
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;          // Provider-specific ID or our internal mapping
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string; // ISO timestamp
  bookmakers: BookmakerOdds[];
}

/**
 * Normalized response from the odds engine
 */
export interface NormalizedOddsResponse {
  events: OddsEvent[];
  count: number;
  timestamp: string;
  provider: string;
}
