import { Sport } from "@/lib/types";
import { OddsEvent } from "./types";
import { OddsProvider } from "./interface";

/**
 * Implementation for PandaScore (Esports)
 * Placeholder support for future expansion
 * https://pandascore.co/
 */
export class PandaScoreProvider implements OddsProvider {
  readonly id = "pandascore";
  readonly name = "PandaScore";

  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.PANDASCORE_API_KEY;
  }

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  async getOdds(sport: Sport, markets: string[] = ["h2h"]): Promise<OddsEvent[]> {
    // Placeholder implementation for esports
    // PandaScore focuses on CS:GO, LoL, Dota 2, etc.
    // If the sport is not an esport we currently support, return empty.
    
    if (!this.isEnabled()) return [];

    // Future: map Sport to PandaScore esports (e.g., 'soccer' -> 'fifa'?)
    // For now, it's a placeholder as requested.
    
    return [];
  }
}
