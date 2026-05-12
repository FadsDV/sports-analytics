import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerProfile, fetchTeamInjuries } from "@/lib/sports/espnPlayers";
import { fetchAFLPlayerHistory } from "@/lib/sports/afl/players/history";
import { computeAFLPlayerAnalytics } from "@/lib/sports/afl/players/analytics";
import { resolveAFLFantasyHeadshot } from "@/lib/sports/afl/fantasyMapper";

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
  const jerseyHint    = searchParams.get("jersey") ?? undefined;
  // Roster-derived headshot: champId-based AFL CDN URL already resolved by the club
  // scraper. Used as the highest-priority headshot source to avoid ESPN's patchy coverage.
  const headshotHint  = searchParams.get("headshot") ?? "";

  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  try {
    const currentYear = new Date().getFullYear();
    const seasons     = [currentYear, currentYear - 1];

    const [games, profile, injuries] = await Promise.all([
      fetchAFLPlayerHistory(teamId, athleteId, seasons),
      fetchPlayerProfile(SPORT_PATH, athleteId),
      fetchTeamInjuries(SPORT_PATH, teamId),
    ]);

    if (games.length === 0) {
      return NextResponse.json({ error: "no game data found" }, { status: 404 });
    }

    const resolvedName = profile?.name || nameHint || "Unknown";
    const playerInjury = injuries.find(i => i.playerId === athleteId || i.playerName.toLowerCase() === resolvedName.toLowerCase());

    // Headshot priority chain:
    //   1. headshotHint   — AFL CDN URL already built by club roster scraper from the
    //                       official data-player champId attribute. Most reliable.
    //   2. AFL Fantasy map — resolveAFLFantasyHeadshot looks up the player by name in
    //                       fantasy.afl.com.au (~808 active players, same champId space).
    //                       Catches players whose club page champId was missing/empty.
    //   3. ESPN profile    — Fallback; AFL CDN coverage on ESPN is patchy and may 404.
    let resolvedHeadshot: string | undefined = headshotHint || undefined;
    if (!resolvedHeadshot) {
      // AFL Fantasy map lookup: async but already cached after first call this process.
      const aflCDNUrl = await resolveAFLFantasyHeadshot(resolvedName);
      if (aflCDNUrl) {
        console.debug(`[SportsPulse] AFL player headshot via Fantasy map: ${resolvedName} → ${aflCDNUrl}`);
        resolvedHeadshot = aflCDNUrl;
      }
    }
    if (!resolvedHeadshot && profile?.headshot) {
      // ESPN CDN — lowest priority for AFL; many players return 404 from ESPN.
      console.debug(`[SportsPulse] AFL player headshot via ESPN: ${resolvedName} → ${profile.headshot}`);
      resolvedHeadshot = profile.headshot;
    }

    const analytics = computeAFLPlayerAnalytics({
      playerId:     athleteId,
      playerName:   resolvedName,
      position:     profile?.position || posHint || "??",
      jersey:       profile?.jersey ?? (jerseyHint || undefined),
      headshot:     resolvedHeadshot,
      games,
      matchContext: homeAway,
      opponent,
      seasons,
      injuryContext: playerInjury ? { status: playerInjury.status, note: playerInjury.note } : undefined,
      totalGamesScheduled: undefined, // Could be derived from team schedule if needed
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
