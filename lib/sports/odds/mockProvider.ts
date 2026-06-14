import { OddsProvider } from "./engine";
import { GameOdds, BookmakerOdds } from "./types";
import { Sport } from "@/lib/types";

export class MockAFLOddsProvider implements OddsProvider {
  name = "Mock AFL Provider";

  async getOdds(sport: Sport, gameId: string): Promise<GameOdds | null> {
    if (sport !== "afl") return null;

    return {
      gameId,
      sport,
      lastUpdate: new Date().toISOString(),
      bookmakers: this.generateMockBookmakers(),
    };
  }

  async getBulkOdds(sport: Sport): Promise<GameOdds[]> {
    if (sport !== "afl") return [];
    // In a real app, we'd fetch all upcoming games and return odds for each
    return [];
  }

  private generateMockBookmakers(): BookmakerOdds[] {
    return [
      {
        key: "sportsbet",
        title: "Sportsbet",
        markets: [
          {
            type: "h2h",
            lastUpdate: new Date().toISOString(),
            selections: [
              { name: "Home Team", price: 1.85 },
              { name: "Away Team", price: 1.95 },
            ],
          },
          {
            type: "spread",
            lastUpdate: new Date().toISOString(),
            selections: [
              { name: "Home Team", price: 1.90, points: -2.5 },
              { name: "Away Team", price: 1.90, points: 2.5 },
            ],
          },
          {
            type: "total",
            lastUpdate: new Date().toISOString(),
            selections: [
              { name: "Over", price: 1.88, points: 165.5 },
              { name: "Under", price: 1.88, points: 165.5 },
            ],
          },
        ],
      },
      {
        key: "tab",
        title: "TAB",
        markets: [
          {
            type: "h2h",
            lastUpdate: new Date().toISOString(),
            selections: [
              { name: "Home Team", price: 1.82 },
              { name: "Away Team", price: 1.98 },
            ],
          },
        ],
      },
    ];
  }
}
