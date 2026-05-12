import { 
  EsportsMatch, 
  EsportsTeam, 
  EsportsPlayer, 
  EsportsTournament, 
  EsportsMatchStatus,
  EsportsGame
} from "@/lib/esports/types";
import { 
  getCanonicalTeamId, 
  getCanonicalPlayerId, 
  getCanonicalTournamentId,
  getCanonicalOrgId,
  generateInternalId 
} from "@/lib/mappings/esports";

/**
 * Normalizes PandaScore status to internal EsportsMatchStatus
 */
export function normalizeStatus(psStatus: string): EsportsMatchStatus {
  switch (psStatus) {
    case "not_started": return "not_started";
    case "running": return "live";
    case "finished": return "completed";
    case "canceled": return "cancelled";
    case "postponed": return "postponed";
    default: return "not_started";
  }
}

/**
 * Normalizes a PandaScore player
 */
export function normalizePlayer(psPlayer: any, gameType: "cs2" | "lol"): EsportsPlayer {
  const canonicalId = getCanonicalPlayerId(psPlayer.name, gameType) || generateInternalId(gameType, psPlayer.name || psPlayer.id.toString());
  
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
  if (!psTeam) {
    return {
      id: "unknown",
      externalId: 0,
      name: "TBD",
      acronym: "TBD"
    };
  }

  const canonicalId = getCanonicalTeamId(psTeam.name, gameType) || generateInternalId(gameType, psTeam.acronym || psTeam.id.toString());
  const orgId = getCanonicalOrgId(psTeam.name);

  return {
    id: canonicalId,
    externalId: psTeam.id,
    name: psTeam.name,
    acronym: psTeam.acronym,
    imageUrl: psTeam.image_url,
    players: psTeam.players?.map((p: any) => normalizePlayer(p, gameType)),
    orgId,
    region: psTeam.location
  };
}

/**
 * Normalizes a PandaScore tournament
 */
export function normalizeTournament(psTournament: any): EsportsTournament {
  const canonicalId = getCanonicalTournamentId(psTournament.name) || generateInternalId('tournament', psTournament.id.toString());
  
  return {
    id: canonicalId,
    externalId: psTournament.id,
    name: psTournament.name,
    leagueId: psTournament.league_id,
    seriesId: psTournament.series_id,
    beginAt: psTournament.begin_at,
    endAt: psTournament.end_at,
    tier: psTournament.tier,
    region: psTournament.league?.location
  };
}

/**
 * Normalizes an individual game within a match
 */
export function normalizeGame(psGame: any): EsportsGame {
  return {
    id: psGame.id,
    status: normalizeStatus(psGame.status),
    beginAt: psGame.begin_at,
    endAt: psGame.end_at,
    position: psGame.position,
    winnerId: psGame.winner?.id ? psGame.winner.id.toString() : undefined,
    complete: psGame.complete
  };
}

/**
 * Normalizes a PandaScore match
 */
export function normalizeMatch(psMatch: any, gameType: "cs2" | "lol"): EsportsMatch {
  const opponents = psMatch.opponents || [];
  const homeOpponent = opponents[0]?.opponent;
  const awayOpponent = opponents[1]?.opponent;

  const homeTeam = normalizeTeam(homeOpponent, gameType);
  const awayTeam = normalizeTeam(awayOpponent, gameType);
  
  const winnerId = psMatch.winner_id ? 
    (psMatch.winner_id === homeOpponent?.id ? homeTeam.id : awayTeam.id) 
    : undefined;

  return {
    id: `match.${psMatch.id}`,
    externalId: psMatch.id,
    status: normalizeStatus(psMatch.status),
    scheduledAt: psMatch.scheduled_at,
    beginAt: psMatch.begin_at,
    endAt: psMatch.end_at,
    tournament: normalizeTournament(psMatch.tournament),
    tournamentStage: psMatch.tournament?.name,
    homeTeam,
    awayTeam,
    winnerId,
    score: {
      home: psMatch.results?.find((r: any) => r.team_id === homeOpponent?.id)?.score || 0,
      away: psMatch.results?.find((r: any) => r.team_id === awayOpponent?.id)?.score || 0,
    },
    numberOfGames: psMatch.number_of_games,
    matchType: psMatch.match_type || "best_of",
    gameType,
    liveUrl: psMatch.live?.url,
    games: psMatch.games?.map(normalizeGame)
  };
}
