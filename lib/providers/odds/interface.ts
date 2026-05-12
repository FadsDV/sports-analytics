import { Sport } from "@/lib/types";
import { OddsEvent } from "./types";

export interface OddsProvider {
  /**
   * Unique identifier for the provider (e.g., 'the-odds-api', 'pandascore')
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Fetch odds for a specific sport
   * @param sport The sport to fetch odds for
   * @param markets Optional list of markets to fetch (e.g., ['h2h', 'spreads'])
   */
  getOdds(sport: Sport, markets?: string[]): Promise<OddsEvent[]>;

  /**
   * Health check or verification that the provider is configured correctly (e.g., API key exists)
   */
  isEnabled(): boolean;
}
