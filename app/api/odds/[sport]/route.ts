import { NextRequest, NextResponse } from "next/server";
import { Sport } from "@/lib/types";
import { oddsManager } from "@/lib/providers/odds";

/**
 * GET /api/odds/[sport]
 * Fetches normalized odds for a specific sport from all enabled providers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sport: string } }
) {
  const sport = params.sport.toLowerCase() as Sport;

  // Validation: Check if sport is supported by our system
  const supportedSports: Sport[] = ["afl", "basketball", "nfl", "soccer", "ucl", "uel", "laliga", "bundesliga", "aleague"];
  
  // Note: 'basketball' is used for NBA in our Sport type mapping
  const sportToFetch = sport === ("nba" as any) ? "basketball" : sport;

  if (!supportedSports.includes(sportToFetch as Sport) && sport !== ("esports" as any)) {
    return NextResponse.json(
      {
        error: "Unsupported sport",
        message: `Sport '${params.sport}' is not supported or recognized.`,
        supported: ["afl", "nba", "nfl", "soccer", "esports"]
      },
      { status: 400 }
    );
  }

  try {
    // Extract markets + kickoff from query params
    const { searchParams } = new URL(request.url);
    const marketsParam = searchParams.get("markets");
    const markets = marketsParam ? marketsParam.split(",") : ["h2h"];
    const kickoffParam = searchParams.get("kickoff");

    // Determine cache TTL based on time-to-game:
    //   > 12 h  → refresh every 12 hours (save credits)
    //   ≤ 12 h  → refresh every 1 hour (stay fresh pre-game)
    //   unknown → 1 hour default
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const ONE_HOUR_S   = 3_600;
    const TWELVE_HR_S  = 43_200;
    let cacheTTL = ONE_HOUR_S;
    if (kickoffParam) {
      const msToGame = new Date(kickoffParam).getTime() - Date.now();
      cacheTTL = msToGame > TWELVE_HOURS ? TWELVE_HR_S : ONE_HOUR_S;
    }

    console.log(`[OddsAPI] Fetching ${markets.join(",")} odds for ${sportToFetch} (TTL ${cacheTTL}s)...`);

    const results = await oddsManager.getOdds(sportToFetch as Sport, markets, cacheTTL);

    return NextResponse.json(
      {
        sport: params.sport,
        timestamp: new Date().toISOString(),
        results,
        count: results.reduce((acc, curr) => acc + curr.count, 0),
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${cacheTTL}, stale-while-revalidate=60`,
        },
      },
    );
  } catch (error) {
    console.error(`[OddsAPI] Error fetching odds for ${params.sport}:`, error);
    
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "An error occurred while fetching odds data."
      },
      { status: 500 }
    );
  }
}
