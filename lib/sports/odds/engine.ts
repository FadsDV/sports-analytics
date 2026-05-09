import { GameOdds } from "./types";
import { Sport } from "@/lib/types";

export interface OddsProvider {
  name: string;
  getOdds(sport: Sport, gameId: string): Promise<GameOdds | null>;
  getBulkOdds(sport: Sport): Promise<GameOdds[]>;
}

export class OddsEngine {
  private providers: OddsProvider[] = [];

  registerProvider(provider: OddsProvider) {
    this.providers.push(provider);
  }

  async getGameOdds(sport: Sport, gameId: string): Promise<GameOdds[]> {
    const results = await Promise.all(
      this.providers.map(p => p.getOdds(sport, gameId))
    );
    return results.filter((r): r is GameOdds => r !== null);
  }

  async getAllOdds(sport: Sport): Promise<GameOdds[]> {
    const all = await Promise.all(
      this.providers.map(p => p.getBulkOdds(sport))
    );
    return all.flat();
  }
}

// Singleton instance
export const oddsEngine = new OddsEngine();
