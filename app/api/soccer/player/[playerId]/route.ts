import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerSeasonStats, fetchPlayerRecentGames } from "@/lib/sports/sofascore";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: { playerId: string } }
) {
  const playerId = Number(params.playerId);
  const opponentTeamIdParam = req.nextUrl.searchParams.get("opponentTeamId");
  const tournamentIdParam   = req.nextUrl.searchParams.get("tournamentId");
  const playerTeamIdParam   = req.nextUrl.searchParams.get("playerTeamId");
  const opponentTeamId  = opponentTeamIdParam ? Number(opponentTeamIdParam) : undefined;
  const tournamentIdHint = tournamentIdParam  ? Number(tournamentIdParam)   : undefined;
  const playerTeamId    = playerTeamIdParam   ? Number(playerTeamIdParam)   : undefined;

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
  }

  const [seasonResult, gamesResult] = await Promise.all([
    fetchPlayerSeasonStats(playerId, tournamentIdHint),
    fetchPlayerRecentGames(playerId, opponentTeamId, playerTeamId),
  ]);

  return NextResponse.json({
    seasonStats:  seasonResult?.stats ?? null,
    tournamentId: seasonResult?.tournamentId ?? null,
    seasonId:     seasonResult?.seasonId ?? null,
    recentGames:  gamesResult.recentGames,
    vsOpponent:   gamesResult.vsOpponent,
    vsHistory:    gamesResult.vsHistory,
  });
}
