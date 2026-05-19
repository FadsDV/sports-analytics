import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerSeasonStats, fetchPlayerRecentGames } from "@/lib/sports/sofascore";
import { fetchFotMobPlayerStats } from "@/lib/sports/soccer/fotmobData";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: { playerId: string } }
) {
  const playerId = Number(params.playerId);
  const opponentTeamIdParam = req.nextUrl.searchParams.get("opponentTeamId");
  const tournamentIdParam   = req.nextUrl.searchParams.get("tournamentId");
  const playerTeamIdParam   = req.nextUrl.searchParams.get("playerTeamId");
  const fotmobIdParam       = req.nextUrl.searchParams.get("fotmobId");

  const opponentTeamId  = opponentTeamIdParam ? Number(opponentTeamIdParam) : undefined;
  const tournamentIdHint = tournamentIdParam  ? Number(tournamentIdParam)   : undefined;
  const playerTeamId    = playerTeamIdParam   ? Number(playerTeamIdParam)   : undefined;
  const fotmobId        = fotmobIdParam       ? Number(fotmobIdParam)       : undefined;

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
  }

  // If FotMob player ID is provided, use FotMob as the data source (reliable, correct player IDs)
  if (fotmobId && !isNaN(fotmobId)) {
    const fotmobStats = await fetchFotMobPlayerStats(fotmobId);
    if (fotmobStats) {
      return NextResponse.json({
        source:       "fotmob",
        seasonStats:  {
          appearances:              fotmobStats.appearances,
          goals:                    fotmobStats.goals,
          assists:                  fotmobStats.assists,
          yellowCards:              fotmobStats.yellowCards,
          expectedGoals:            fotmobStats.xG,
          expectedAssists:          fotmobStats.xA,
          totalShots:               fotmobStats.shots,
          shotsOnTarget:            fotmobStats.shotsOnTarget,
          keyPasses:                fotmobStats.keyPasses,
          tackles:                  fotmobStats.tackles,
          interceptions:            fotmobStats.interceptions,
          accuratePassesPercentage: fotmobStats.passAccuracy,
          rating:                   fotmobStats.rating,
          minutesPlayed:            fotmobStats.minutesPlayed,
        },
        recentGames:  fotmobStats.recentMatches.map(m => ({
          eventId:       m.matchId,
          date:          m.date,
          homeTeam:      m.homeTeam,
          awayTeam:      m.awayTeam,
          homeScore:     m.homeScore,
          awayScore:     m.awayScore,
          homeTeamId:    null,
          awayTeamId:    null,
          playerTeamId:  null,
          goals:         m.goals,
          assists:       m.assists,
          rating:        m.rating,
          minutesPlayed: m.minutesPlayed,
          shots:         m.shots,
          shotsOnTarget: m.shotsOnTarget,
          keyPasses:     m.keyPasses,
          passes:        m.passes,
          passAccuracy:  m.passAccuracy,
          tackles:       m.tackles,
          interceptions: m.interceptions,
          yellowCards:   m.yellowCards,
          foulsCommitted: null,
          saves:         null,
          xG:            m.xG,
          xA:            m.xA,
        })),
        vsOpponent:  null,
        vsHistory:   [],
        photoUrl:    fotmobStats.photoUrl,
      });
    }
    // Fall through to Sofascore if FotMob fails
  }

  // Sofascore fallback (used when no fotmobId provided or FotMob fails)
  const [seasonResult, gamesResult] = await Promise.all([
    fetchPlayerSeasonStats(playerId, tournamentIdHint),
    fetchPlayerRecentGames(playerId, opponentTeamId, playerTeamId),
  ]);

  return NextResponse.json({
    source:       "sofascore",
    seasonStats:  seasonResult?.stats ?? null,
    tournamentId: seasonResult?.tournamentId ?? null,
    seasonId:     seasonResult?.seasonId ?? null,
    recentGames:  gamesResult.recentGames,
    vsOpponent:   gamesResult.vsOpponent,
    vsHistory:    gamesResult.vsHistory,
  });
}
