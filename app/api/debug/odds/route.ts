/**
 * GET /api/debug/odds?home=GWS+Giants&away=Brisbane+Lions
 *
 * Diagnostic endpoint — returns exactly what The Odds API gives us for AFL
 * player props on the free tier. Lets us verify:
 *   - Which AFL events the API knows about
 *   - Which prop markets are available (player_disposals, player_goals_scored_over, etc.)
 *   - What player names the API uses (to spot name-matching issues)
 *   - Which bookmakers/lines come back
 *
 * Also shows what's in the Blob odds cache for the matched game.
 *
 * Protected by CRON_SECRET (same as cron routes) — requires:
 *   Authorization: Bearer {CRON_SECRET}
 */

import { type NextRequest } from "next/server";
import { resolveTeamCanonicalId } from "@/lib/mappings";
import { fetchOddsFromBlob } from "@/lib/sports/afl/oddsCache";
import { normalizeAFLName } from "@/lib/sports/afl/fantasyMapper";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorised(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const homeParam = searchParams.get("home") ?? "";
  const awayParam = searchParams.get("away") ?? "";
  const gameId    = searchParams.get("gameId") ?? "";  // e.g. "afl-1133580" (optional)

  const apiKey = process.env.THE_ODDS_API_KEY;

  // ── 1. Fetch AFL event list ───────────────────────────────────────────────
  let events: { id: string; home_team: string; away_team: string; commence_time: string }[] = [];
  let eventsError: string | null = null;

  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/aussierules_afl/events?apiKey=${apiKey}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        events = await res.json();
      } else {
        eventsError = `${res.status} ${res.statusText}`;
      }
    } catch (err) {
      eventsError = err instanceof Error ? err.message : String(err);
    }
  }

  // ── 2. Match event if teams provided ─────────────────────────────────────
  let matchedEvent: (typeof events)[0] | null = null;
  let propsData: unknown = null;
  let propsError: string | null = null;
  let normalizedPlayers: string[] = [];
  let availableMarkets: string[] = [];

  if (homeParam && awayParam && events.length > 0) {
    const homeId = resolveTeamCanonicalId(homeParam, "afl");
    const awayId  = resolveTeamCanonicalId(awayParam, "afl");
    matchedEvent = events.find(e => {
      const eH = resolveTeamCanonicalId(e.home_team, "afl");
      const eA = resolveTeamCanonicalId(e.away_team, "afl");
      return (eH === homeId && eA === awayId) || (eH === awayId && eA === homeId);
    }) ?? null;

    if (matchedEvent && apiKey) {
      try {
        const markets = "player_disposals,player_goals_scored_over,player_marks_over,player_tackles_over";
        const res = await fetch(
          `https://api.the-odds-api.com/v4/sports/aussierules_afl/events/${matchedEvent.id}/odds` +
          `?apiKey=${apiKey}&regions=au&markets=${markets}&oddsFormat=decimal`,
          { cache: "no-store" },
        );
        if (res.ok) {
          propsData = await res.json();
          const pd = propsData as { bookmakers?: { key: string; title: string; markets?: { key: string; outcomes?: { description: string; name: string; point: number; price: number }[] }[] }[] };
          const playerSet = new Set<string>();
          const marketSet = new Set<string>();
          for (const bm of pd.bookmakers ?? []) {
            for (const market of bm.markets ?? []) {
              marketSet.add(market.key);
              for (const o of market.outcomes ?? []) {
                if (o.name === "Over") playerSet.add(o.description);
              }
            }
          }
          normalizedPlayers = Array.from(playerSet).map(n => `${n} → ${normalizeAFLName(n)}`);
          availableMarkets  = Array.from(marketSet);
        } else {
          propsError = `${res.status} ${res.statusText}`;
        }
      } catch (err) {
        propsError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // ── 3. Blob cache status ──────────────────────────────────────────────────
  let blobOdds: Record<string, unknown> | null = null;
  let blobError: string | null = null;
  const targetGameId = gameId || (matchedEvent ? `afl-${matchedEvent.id}` : null);

  if (targetGameId) {
    try {
      const fromBlob = await fetchOddsFromBlob(targetGameId);
      if (fromBlob) {
        blobOdds = Object.fromEntries(Array.from(fromBlob.entries()));
      }
    } catch (err) {
      blobError = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json({
    ok:  true,
    apiKeySet:         Boolean(apiKey),
    eventsFound:       events.length,
    eventsError,
    events:            events.slice(0, 10).map(e => ({
      id: e.id, home: e.home_team, away: e.away_team, time: e.commence_time,
    })),
    matchedEvent,
    availableMarkets,
    normalizedPlayers,
    propsError,
    propsRaw:          propsData,
    blobGameId:        targetGameId,
    blobEntriesCount:  blobOdds ? Object.keys(blobOdds).length : null,
    blobEntries:       blobOdds,
    blobError,
  });
}
