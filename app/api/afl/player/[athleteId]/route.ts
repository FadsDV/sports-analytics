import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerProfile } from "@/lib/sports/espnPlayers";
import { fetchAFLPlayerHistory } from "@/lib/sports/afl/players/history";
import { computeAFLPlayerAnalytics } from "@/lib/sports/afl/players/analytics";

const SPORT_PATH = "australian-football/afl";

export async function GET(
  request: NextRequest,
  { params }: { params: { athleteId: string } }
) {
  const { athleteId } = params;
  const { searchParams } = request.nextUrl;
  const homeAway = searchParams.get("homeAway") === "away" ? "away" : "home";
  const opponent = searchParams.get("opponent") ?? "";
  const teamId   = searchParams.get("teamId") ?? "";
  const nameHint = searchParams.get("name") ?? "";
  const posHint  = searchParams.get("position") ?? "";
  const jerseyHint = searchParams.get("jersey") ?? undefined;

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  try {
    const currentYear = new Date().getFullYear();
    const seasons     = [currentYear, currentYear - 1];

    const [games, profile] = await Promise.all([
      fetchAFLPlayerHistory(teamId, athleteId, seasons),
      fetchPlayerProfile(SPORT_PATH, athleteId),
    ]);

    if (games.length === 0) {
      return NextResponse.json({ error: "no game data found" }, { status: 404 });
    }

    const analytics = computeAFLPlayerAnalytics({
      playerId:     athleteId,
      playerName:   profile?.name || nameHint || "Unknown",
      position:     profile?.position || posHint || "??",
      jersey:       profile?.jersey ?? (jerseyHint || undefined),
      headshot:     profile?.headshot,
      games,
      matchContext: homeAway,
      opponent,
      seasons,
    });

    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
