import type { SofascoreGameLog, SofascorePlayerSeasonStats } from "@/lib/sports/sofascore";

export interface SoccerPlayerAnalyticsResult {
  playerId:      number;
  playerName:    string;
  shortName:     string;
  position:      string;
  jersey?:       string;
  headshot?:     string;
  teamName:      string;
  teamAbbr:      string;
  opponent:      string;
  side:          "home" | "away";
  seasonStats:   SofascorePlayerSeasonStats | null;
  recentGames:   SofascoreGameLog[];
  vsOpponent:    {
    lastMatchup: SofascoreGameLog | null;
    history:     SofascoreGameLog[];
  };
  homeAvg:       Record<string, number | null>;
  awayAvg:       Record<string, number | null>;
  trends: {
    goals:       (number | null)[];
    shots:       (number | null)[];
    shotsOnTarget: (number | null)[];
    rating:      (number | null)[];
  };
}
