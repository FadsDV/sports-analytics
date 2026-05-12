import { 
  EsportsMatch, 
  EsportsTeam, 
  EsportsPlayer, 
  EsportsTournament, 
  EsportsMatchStatus 
} from "@/lib/esports/types";
import { getCanonicalTeamId, getCanonicalPlayerId, generateInternalId } from "@/lib/mappings/esports";

/**
 * Normalizes PandaScore status to internal EsportsMatchStatus
 */
export function normalizeStatus(psStatus: string): EsportsMatchStatus {
  switch (psStatus) {
    case "not_started": return "not_started";
    case "running": return "running";
    case "finished": return "finished";
    case "canceled": return "canceled";
    case "postponed": return "postponed";
    default: return "not_started";
  }
}

/**
 * Normalizes a PandaScore player
 */
export function normalizePlayer(psPlayer: any, gameType: "cs2" | "lol"): EsportsPlayer {
  const canonicalId = getCanonicalPlayerId(psPlayer.name) || generateInternalId(gameType, psPlayer.name || psPlayer.id.toString());
  
  return {
    id: canonicalId,
    externalId: psPlayer.id,
    name: psPlayer.name,
    firstName: psPlayer.first_name,
    lastName: psPlayer.last_name,
    handle: psPlayer.name,
    nationality: psPlayer.nationality,
    role: psPlayer.role,
    imageUrl: psPlayer.image_url,
  };
}

/**
 * Normalizes a PandaScore team
 */
export function normalizeTeam(psTeam: any, gameType: "cs2" | "lol"): EsportsTeam {
  const canonicalId = getCanonicalTeamId(psTeam.name) || generateInternalId(gameType, psTeam.acronym || psTeam.id.toString());
  
  return {
    id: canonicalId,
    externalId: psTeam.id,
    name: psTeam.name,
    acronym: psTeam.acronym,
    imageUrl: psTeam.image_url,
    players: psTeam.players?.map((p: any) => normalizePlayer(p, gameType)),
  };
}

/**
 * Normalizes a PandaScore tournament
 */
export function normalizeTournament(psTournament: any): EsportsTournament {
  return {
    id: `tournament.${psTournament.id}`,
    externalId: psTournament.id,
    name: psTournament.name,
    leagueId: psTournament.league_id,
    seriesId: psTournament.series_id,
    beginAt: psTournament.begin_at,
    endAt: psTournament.end_at,
  };
}

/**
 * Normalizes a PandaScore match
 */
export function normalizeMatch(psMatch: any, gameType: "cs2" | "lol"): EsportsMatch {
  const homeTeam = normalizeTeam(psMatch.opponents[0]?.opponent, gameType);
  const awayTeam = normalizeTeam(psMatch.opponents[1]?.opponent, gameType);
  
  const winner = psMatch.winner_id ? 
    (psMatch.winner_id === psMatch.opponents[0]?.opponent?.id ? homeTeam.id : awayTeam.id) 
    : undefined;

  return {
    id: `match.${psMatch.id}`,
    externalId: psMatch.id,
    status: normalizeStatus(psMatch.status),
    scheduledAt: psMatch.scheduled_at,
    beginAt: psMatch.begin_at,
    endAt: psMatch.end_at,
    tournament: normalizeTournament(psMatch.tournament),
    homeTeam,
    awayTeam,
    winnerId: winner,
    score: {
      home: psMatch.results.find((r: any) => r.team_id === psMatch.opponents[0]?.opponent?.id)?.score || 0,
      away: psMatch.results.find((r: any) => r.team_id === psMatch.opponents[1]?.opponent?.id)?.score || 0,
    },
    numberOfGames: psMatch.number_of_games,
    gameType,
    liveUrl: psMatch.live?.url,
  };
}
