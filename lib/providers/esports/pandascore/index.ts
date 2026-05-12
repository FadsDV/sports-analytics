import { PandaScoreClient } from "./client";
import { normalizeMatch, normalizeTournament, normalizeTeam } from "./normalization";
import { EsportsMatch, EsportsTournament, EsportsTeam } from "@/lib/esports/types";

export class PandaScoreProvider {
  private client: PandaScoreClient;

  constructor() {
    this.client = new PandaScoreClient();
  }

  /**
   * Fetches upcoming matches for a specific game
   */
  async getUpcomingMatches(game: "cs2" | "lol", limit = 10): Promise<EsportsMatch[]> {
    const endpoint = `/${game}/matches/upcoming`;
    try {
      const rawMatches = await this.client.fetch<any[]>(endpoint, { 
        per_page: limit,
        sort: "scheduled_at" 
      });
      return rawMatches.map(m => normalizeMatch(m, game));
    } catch (error) {
      console.error(`Failed to fetch upcoming ${game} matches:`, error);
      return [];
    }
  }

  /**
   * Fetches live matches for a specific game
   */
  async getLiveMatches(game: "cs2" | "lol"): Promise<EsportsMatch[]> {
    const endpoint = `/${game}/matches/running`;
    try {
      const rawMatches = await this.client.fetch<any[]>(endpoint);
      return rawMatches.map(m => normalizeMatch(m, game));
    } catch (error) {
      console.error(`Failed to fetch live ${game} matches:`, error);
      return [];
    }
  }

  /**
   * Fetches completed matches for a specific game
   */
  async getPastMatches(game: "cs2" | "lol", limit = 10): Promise<EsportsMatch[]> {
    const endpoint = `/${game}/matches/past`;
    try {
      const rawMatches = await this.client.fetch<any[]>(endpoint, { 
        per_page: limit,
        sort: "-end_at" 
      });
      return rawMatches.map(m => normalizeMatch(m, game));
    } catch (error) {
      console.error(`Failed to fetch past ${game} matches:`, error);
      return [];
    }
  }

  /**
   * Fetches tournaments for a specific game
   */
  async getTournaments(game: "cs2" | "lol", limit = 5): Promise<EsportsTournament[]> {
    const endpoint = `/${game}/tournaments`;
    const rawTournaments = await this.client.fetch<any[]>(endpoint, { 
      per_page: limit,
      sort: "-begin_at" 
    });
    return rawTournaments.map(normalizeTournament);
  }

  /**
   * Fetches team details including roster
   */
  async getTeam(game: "cs2" | "lol", teamIdOrSlug: string | number): Promise<EsportsTeam> {
    const endpoint = `/teams/${teamIdOrSlug}`;
    const rawTeam = await this.client.fetch<any>(endpoint);
    return normalizeTeam(rawTeam, game);
  }
}

export const pandascore = new PandaScoreProvider();
