import { EsportsMatch, EsportsTeam, EsportsPlayer } from "./types";

/**
 * Generic interface for an eSports data provider
 */
export interface EsportsProvider {
  id: string;
  getUpcomingMatches(game: string): Promise<EsportsMatch[]>;
  getLiveMatches(game: string): Promise<EsportsMatch[]>;
  getPastMatches(game: string): Promise<EsportsMatch[]>;
}

/**
 * Shared utilities for eSports data manipulation
 */
export const EsportsUtils = {
  /**
   * Sorts matches by date
   */
  sortByDate(matches: EsportsMatch[], order: 'asc' | 'desc' = 'asc'): EsportsMatch[] {
    return [...matches].sort((a, b) => {
      const dateA = new Date(a.scheduledAt).getTime();
      const dateB = new Date(b.scheduledAt).getTime();
      return order === 'asc' ? dateA - dateB : dateB - dateA;
    });
  },

  /**
   * Filter matches by game type
   */
  filterByGame(matches: EsportsMatch[], game: "cs2" | "lol"): EsportsMatch[] {
    return matches.filter(m => m.gameType === game);
  },

  /**
   * Formats a score string (e.g. "2 - 1")
   */
  formatScore(match: EsportsMatch): string {
    if (!match.score) return "v";
    return `${match.score.home} - ${match.score.away}`;
  }
};
