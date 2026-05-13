import { NextRequest, NextResponse } from "next/server";
import { fetchTeamInjuries } from "@/lib/sports/espnPlayers";
import { fetchNBAPlayerHistory } from "@/lib/sports/nba/players/history";
import { computeNBAPlayerAnalytics } from "@/lib/sports/nba/players/analytics";

const SPORT_PATH = "basketball/nba";

export async function GET(
  request: NextRequest,
  { params }: { params: { athleteId: string } }
) {
  const { athleteId } = params;
  const { searchParams } = request.nextUrl;
  const homeAway     = searchParams.get("homeAway") === "away" ? "away" : "home";
  const opponent     = searchParams.get("opponent") ?? "";
  const teamId       = searchParams.get("teamId") ?? "";
  const nameHint     = searchParams.get("name") ?? "";
  const posHint      = searchParams.get("position") ?? "";
  const jerseyHint   = searchParams.get("jersey") ?? undefined;
  const headshotHint = searchParams.get("headshot") ?? "";

  try {
    // History requires teamId (schedule-based approach); injuries are optional.
    const [historyResult, injuries] = await Promise.all([
      fetchNBAPlayerHistory(teamId, athleteId),
      teamId ? fetchTeamInjuries(SPORT_PATH, teamId) : Promise.resolve([]),
    ]);
    const { games, seasonsIncluded } = historyResult;

    console.info(
      `[SportsPulse] NBA player API — athlete:${athleteId} team:${teamId} ` +
      `games:${games.length} seasons:${seasonsIncluded.join(",")}`
    );

    // Identity comes entirely from roster URL hints (roster API is reliable).
    // ESPN /athletes/{id} endpoint is unreliable for NBA and is not called.
    const resolvedName    = nameHint    || "Unknown";
    const resolvedPos     = posHint     || "??";
    const resolvedJersey  = jerseyHint  || undefined;
    const resolvedHeadshot =
      (headshotHint || undefined) ??
      `https://a.espncdn.com/i/headshots/nba/players/full/${athleteId}.png`;

    const playerInjury = injuries.find(
      i =>
        i.playerId === athleteId ||
        i.playerName.toLowerCase() === resolvedName.toLowerCase()
    );

    const analytics = computeNBAPlayerAnalytics({
      playerId:        athleteId,
      playerName:      resolvedName,
      position:        resolvedPos,
      jersey:          resolvedJersey,
      headshot:        resolvedHeadshot,
      games,
      seasonsIncluded,
      matchContext:    homeAway,
      opponent,
      injuryContext: playerInjury
        ? { status: playerInjury.status, note: playerInjury.note }
        : undefined,
    });

    return NextResponse.json(analytics, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[SportsPulse] NBA player API error", { athleteId, teamId, err });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
