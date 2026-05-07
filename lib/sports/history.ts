import { H2HGame, Sport } from "@/lib/types";
import {
  deriveTeamHistoryFromSchedule,
  fetchTeamSchedule,
  findH2HFromSchedule,
  VenueFilter,
  ESPN_PATHS,
  TeamHistoryGame,
} from "@/lib/sports/espn";

export type MatchHistoryItem = {
  gameId: string;
  date: string;
  venue: string;
  homeAway: "home" | "away";
  opponent: string;
  score: string | null;
  result: "W" | "L" | "D" | null;
};

export async function fetchTeamMatchHistory(
  sport: Sport,
  teamId: string,
  filter: VenueFilter = "all"
): Promise<MatchHistoryItem[]> {
  if (sport in ESPN_PATHS) {
    const espnSport = sport as keyof typeof ESPN_PATHS;
    const schedule = await fetchTeamSchedule(espnSport, teamId);
    return deriveTeamHistoryFromSchedule(espnSport, schedule, teamId, filter) as TeamHistoryGame[];
  }
  return [];
}

export async function fetchHeadToHead(
  sport: Sport,
  teamAId: string,
  teamBId: string,
  filter: VenueFilter = "all",
  limit = 5,
  myTeamName?: string
): Promise<H2HGame[]> {
  if (sport in ESPN_PATHS) {
    const espnSport = sport as keyof typeof ESPN_PATHS;
    const schedule = await fetchTeamSchedule(espnSport, teamAId);
    return findH2HFromSchedule(
      schedule,
      myTeamName ?? "",
      teamBId,
      { limit, filter, sport: espnSport }
    );
  }
  return [];
}
