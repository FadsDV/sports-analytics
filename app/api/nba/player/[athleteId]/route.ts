import { NextRequest, NextResponse } from "next/server";
import { fetchNBAPlayerHistory } from "@/lib/sports/nba/players/history";
import { computeNBAPlayerAnalytics } from "@/lib/sports/nba/players/analytics";

export async function GET(
  request:  NextRequest,
  { params }: { params: { athleteId: string } }
) {
  const { athleteId } = params;
  const { searchParams } = request.nextUrl;

  const teamId       = searchParams.get("teamId") ?? "";
  const homeAway     = searchParams.get("homeAway") === "away" ? "away" : "home";
  const opponent     = searchParams.get("opponent") ?? "";
  const nameHint     = searchParams.get("name") ?? "";
  const posHint      = searchParams.get("position") ?? "";
  const jerseyHint   = searchParams.get("jersey") ?? undefined;
  const headshotHint = searchParams.get("headshot") ?? "";

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  try {
    const { games, seasonsIncluded } = await fetchNBAPlayerHistory(teamId, athleteId);

    if (games.length === 0) {
      return NextResponse.json({ error: "no game data found" }, { status: 404 });
    }

    const analytics = computeNBAPlayerAnalytics({
      playerId:        athleteId,
      playerName:      nameHint || "Unknown",
      position:        posHint  || "??",
      jersey:          jerseyHint,
      headshot:        headshotHint || undefined,
      teamId,
      games,
      seasonsIncluded,
      matchContext:    homeAway,
      opponent,
    });

    return NextResponse.json(analytics, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
