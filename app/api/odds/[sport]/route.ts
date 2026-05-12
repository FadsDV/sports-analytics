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
    // Extract markets from query params if provided
    const { searchParams } = new URL(request.url);
    const marketsParam = searchParams.get("markets");
    const markets = marketsParam ? marketsParam.split(",") : ["h2h"];

    console.log(`[OddsAPI] Fetching ${markets.join(",")} odds for ${sportToFetch}...`);

    const results = await oddsManager.getOdds(sportToFetch as Sport, markets);

    return NextResponse.json({
      sport: params.sport,
      timestamp: new Date().toISOString(),
      results,
      count: results.reduce((acc, curr) => acc + curr.count, 0)
    });
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
