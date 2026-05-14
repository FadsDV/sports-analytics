import { Sport } from "@/lib/types";
import { OddsEvent, NormalizedOddsResponse } from "./types";
import { OddsProvider } from "./interface";
import { TheOddsApiProvider } from "./the-odds-api";
import { PandaScoreProvider } from "./pandascore";

export * from "./types";
export * from "./interface";
export * from "./cache";

class OddsManager {
  private providers: OddsProvider[] = [
    new TheOddsApiProvider(),
    new PandaScoreProvider(),
  ];

  /**
   * Get odds from all enabled providers and aggregate them
   */
  async getOdds(sport: Sport, markets?: string[], cacheTTL?: number): Promise<NormalizedOddsResponse[]> {
    const enabledProviders = this.providers.filter(p => p.isEnabled());

    const results = await Promise.all(
      enabledProviders.map(async (provider) => {
        try {
          const events = await provider.getOdds(sport, markets, cacheTTL);
          return {
            provider: provider.name,
            events,
            count: events.length,
            timestamp: new Date().toISOString(),
          } as NormalizedOddsResponse;
        } catch (error) {
          console.error(`Error fetching from ${provider.name}:`, error);
          return null;
        }
      })
    );

    return results.filter((r): r is NormalizedOddsResponse => r !== null);
  }

  /**
   * Register a new provider (useful for testing or dynamic expansion)
   */
  registerProvider(provider: OddsProvider) {
    this.providers.push(provider);
  }
}

export const oddsManager = new OddsManager();
