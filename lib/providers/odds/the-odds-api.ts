import { Sport } from "@/lib/types";
import { OddsEvent, MarketType, OddsMarket, OddsOutcome, BookmakerOdds } from "./types";
import { OddsProvider } from "./interface";
import { oddsCache, OddsCache } from "./cache";

/**
 * Implementation for The Odds API
 * https://the-odds-api.com/
 */
export class TheOddsApiProvider implements OddsProvider {
  readonly id = "the-odds-api";
  readonly name = "The Odds API";

  private readonly apiKey: string | undefined;
  private readonly baseUrl = "https://api.the-odds-api.com/v4/sports";

  constructor() {
    this.apiKey = process.env.THE_ODDS_API_KEY;
  }

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  async getOdds(sport: Sport, markets: string[] = ["h2h"]): Promise<OddsEvent[]> {
    if (!this.isEnabled()) return [];

    const providerSport = this.mapSport(sport);
    if (!providerSport) return [];

    const cacheKey = OddsCache.generateKey(this.id, sport, markets);
    const cached = oddsCache.get<OddsEvent[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = new URL(`${this.baseUrl}/${providerSport}/odds/`, this.baseUrl);
      url.searchParams.append("apiKey", this.apiKey!);
      url.searchParams.append("regions", "au"); // Default to Australia region
      url.searchParams.append("markets", markets.join(","));
      url.searchParams.append("oddsFormat", "decimal");

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`The Odds API responded with ${response.status}`);
      }

      const data = await response.json();
      const normalized = this.normalize(data, sport);
      
      oddsCache.set(cacheKey, normalized);
      return normalized;
    } catch (error) {
      console.error("[TheOddsApiProvider] Error fetching odds:", error);
      return [];
    }
  }

  private mapSport(sport: Sport): string | null {
    const mapping: Partial<Record<Sport, string>> = {
      afl: "aussierules_afl",
      basketball: "basketball_nba",
      nfl: "americanfootball_nfl",
      soccer: "soccer_epl", // Default soccer to EPL for now
      ucl: "soccer_uefa_champs_league",
      laliga: "soccer_spain_la_liga",
      bundesliga: "soccer_germany_bundesliga",
      aleague: "soccer_australia_aleague",
    };
    return mapping[sport] || null;
  }

  private normalize(data: any[], sport: Sport): OddsEvent[] {
    return data.map((event: any) => ({
      id: event.id,
      sport,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bookmakers: event.bookmakers.map((bm: any): BookmakerOdds => ({
        id: bm.key,
        key: bm.key,
        title: bm.title,
        markets: bm.markets.map((m: any): OddsMarket => ({
          id: `${bm.key}_${m.key}_${event.id}`,
          key: this.mapMarket(m.key),
          lastUpdate: m.last_update,
          outcomes: m.outcomes.map((o: any): OddsOutcome => ({
            id: `${bm.key}_${m.key}_${o.name}_${event.id}`,
            name: o.name,
            price: o.price,
            point: o.point,
          })),
        })),
      })),
    }));
  }

  private mapMarket(marketKey: string): MarketType {
    const mapping: Record<string, MarketType> = {
      h2h: "h2h",
      spreads: "spread",
      totals: "totals",
      outrights: "outrights",
    };
    return mapping[marketKey] || "h2h";
  }
}
