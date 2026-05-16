import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerSeasonStats, fetchPlayerRecentGames } from "@/lib/sports/sofascore";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: { playerId: string } }
) {
  const playerId = Number(params.playerId);
  const sport = req.nextUrl.searchParams.get("sport") ?? "soccer";
  const opponentTeamIdParam = req.nextUrl.searchParams.get("opponentTeamId");
  const opponentTeamId = opponentTeamIdParam ? Number(opponentTeamIdParam) : undefined;

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
  }

  const [seasonResult, gamesResult] = await Promise.all([
    fetchPlayerSeasonStats(playerId, sport),
    fetchPlayerRecentGames(playerId, opponentTeamId),
  ]);

  return NextResponse.json({
    seasonStats:  seasonResult?.stats ?? null,
    tournamentId: seasonResult?.tournamentId ?? null,
    seasonId:     seasonResult?.seasonId ?? null,
    recentGames:  gamesResult.recentGames,
    vsOpponent:   gamesResult.vsOpponent,
  });
}
