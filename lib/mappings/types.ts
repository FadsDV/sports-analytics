import { Sport } from "@/lib/types";

export interface CanonicalTeam {
  id: string;          // Canonical ID (e.g., "afl.adel", "nba.lal")
  sport: Sport;
  displayName: string; // "Adelaide Crows"
  shortName: string;   // "Adelaide"
  abbr: string;        // "ADEL"
  aliases: string[];   // Known names from different providers
}

export interface TeamMapping {
  teams: CanonicalTeam[];
}
