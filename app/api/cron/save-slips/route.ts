/**
 * GET /api/cron/save-slips
 *
 * Vercel cron job — runs daily at 8am AEST (22:00 UTC).
 * Fetches today's AFL scoreboard, computes kitchen slips for every
 * upcoming/live game, and saves them to Vercel Blob for analytics.
 *
 * Safe to call multiple times — skips games that already have slips saved.
 * Also manually callable: GET /api/cron/save-slips
 * (protected by CRON_SECRET env var when set)
 */

import { type NextRequest } from "next/server";
import {
  fetchESPNScoreboard, transformESPNEvent, fetchTeamSchedule,
  ESPN_PATHS, fetchAFLBoxScoreForPicks,
  type AFLGamePlayerStats,
} from "@/lib/sports/espn";
import { fetchTeamInjuries } from "@/lib/sports/espnPlayers";
import { fetchAFLStandings } from "@/lib/sports/squiggle";
import { computeAFLKitchen, type AFLGameMeta } from "@/lib/sports/afl/kitchen";
import { fetchAFLMatchExcluded } from "@/lib/sports/afl/lineups";
import { BOOKIES } from "@/lib/sports/afl/bookies";
import { logSlips, hasSlips } from "@/lib/local/slipDb";
import { resolveTeamCanonicalId } from "@/lib/mappings";
import { fetchOddsFromBlob, blobEntriesToPropOdds } from "@/lib/sports/afl/oddsCache";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 10;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret set → allow all (dev / initial setup)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── AFL kitchen helper (mirrors page.tsx AFL section) ────────────────────────

async function saveSlipsForGame(event: any): Promise<{ gameId: string; skipped: boolean; legs: number; error?: string }> {
  const sport = "afl" as const;
  const espnSport = sport;
  const comp       = event.competitions?.[0];
  if (!comp) return { gameId: event.id, skipped: true, legs: 0, error: "no comp" };

  const game = transformESPNEvent(event, espnSport);
  if (!game) return { gameId: event.id, skipped: true, legs: 0, error: "transform failed" };

  const gameId = `afl-${event.id}`;

  // Skip if slips already saved for this game
  if (await hasSlips(gameId)) return { gameId, skipped: true, legs: 0 };

  const homeId = String(game.homeTeam.espnId ?? "");
  const awayId = String(game.awayTeam.espnId ?? "");
  if (!homeId || !awayId) return { gameId, skipped: true, legs: 0, error: "no team IDs" };

  try {
    const sp = ESPN_PATHS[espnSport];

    // Fetch schedules + injuries in parallel
    const [homeSchedule, awaySchedule, homeInjuries, awayInjuries] = await Promise.all([
      fetchTeamSchedule(espnSport, homeId),
      fetchTeamSchedule(espnSport, awayId),
      fetchTeamInjuries(sp, homeId),
      fetchTeamInjuries(sp, awayId),
    ]);

    // Last 8 completed games each
    const completedHomeGames = (homeSchedule as any[])
      .filter(e => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 8);
    const completedAwayGames = (awaySchedule as any[])
      .filter(e => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 8);

    if (completedHomeGames.length === 0 && completedAwayGames.length === 0) {
      return { gameId, skipped: true, legs: 0, error: "no completed games" };
    }

    // Build game meta for intelligence signals
    const daysBetween = (a: string, b: string) =>
      Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

    const kickoffStr = game.kickoff ?? new Date().toISOString();

    const homeGameMeta: AFLGameMeta[] = completedHomeGames.map((e: any) => ({
      venueName:  String(e.competitions?.[0]?.venue?.fullName ?? ""),
      opponentId: String(e.competitions?.[0]?.competitors
        ?.find((c: any) => String(c.team?.id) !== homeId)?.team?.id ?? ""),
      gameDate: e.date ?? "",
    }));

    const awayGameMeta: AFLGameMeta[] = completedAwayGames.map((e: any) => ({
      venueName:  String(e.competitions?.[0]?.venue?.fullName ?? ""),
      opponentId: String(e.competitions?.[0]?.competitors
        ?.find((c: any) => String(c.team?.id) !== awayId)?.team?.id ?? ""),
      gameDate: e.date ?? "",
    }));

    const lastHomeDate = homeGameMeta.map(m => m.gameDate).filter(Boolean).sort().pop() ?? "";
    const lastAwayDate = awayGameMeta.map(m => m.gameDate).filter(Boolean).sort().pop() ?? "";
    const homeRestDays = lastHomeDate ? daysBetween(lastHomeDate, kickoffStr) : 0;
    const awayRestDays = lastAwayDate ? daysBetween(lastAwayDate, kickoffStr) : 0;

    // Fetch boxscores + standings in parallel (all cached 24h)
    const homeIds = completedHomeGames.map((e: any) => String(e.id));
    const awayIds = completedAwayGames.map((e: any) => String(e.id));

    const seasonYear = (event.season?.year ?? new Date(game.kickoff ?? Date.now()).getFullYear()) as number;
    const weekNumber = (event.week?.number ?? 1) as number;

    const [squiggleStandings, lineupResult, ...rawBoxScores] = await Promise.all([
      fetchAFLStandings(),
      fetchAFLMatchExcluded(seasonYear, weekNumber, homeId, awayId),
      ...homeIds.map(id => fetchAFLBoxScoreForPicks(id)),
      ...awayIds.map(id => fetchAFLBoxScoreForPicks(id)),
    ]);

    const homeMatchExcluded = (lineupResult as Awaited<ReturnType<typeof fetchAFLMatchExcluded>>)?.home ?? null;
    const awayMatchExcluded = (lineupResult as Awaited<ReturnType<typeof fetchAFLMatchExcluded>>)?.away ?? null;

    const boxScores = rawBoxScores as AFLGamePlayerStats[][];
    const homeBoxScores = boxScores.slice(0, homeIds.length);
    const awayBoxScores = boxScores.slice(homeIds.length);

    // Compute kitchen slips — use Blob cache if scraper has pushed odds,
    // otherwise fall back to empty (skipping Odds API to preserve quota).
    let propOdds = new Map<string, { price: number; line: number; bookmaker: string }>();
    try {
      const blobRaw = await fetchOddsFromBlob(gameId);
      if (blobRaw && blobRaw.size > 0) {
        propOdds = blobEntriesToPropOdds(Object.fromEntries(blobRaw));
        console.info(`[cron/save-slips] ${gameId}: using ${propOdds.size} Blob odds`);
      }
    } catch (err) {
      console.warn("[cron/save-slips] Blob odds read failed:", err instanceof Error ? err.message : String(err));
    }

    const kitchenResult = computeAFLKitchen({
      homeGames:    homeBoxScores,
      awayGames:    awayBoxScores,
      homeTeamId:   homeId,
      awayTeamId:   awayId,
      homeAbbr:     game.homeTeam.shortName,
      awayAbbr:     game.awayTeam.shortName,
      propOdds,
      homeGameMeta,
      awayGameMeta,
      currentVenue: game.venue ?? "",
      weather:      null,
      homeRestDays,
      awayRestDays,
      homeInjuries: [
        ...homeInjuries.map(i => ({ playerName: i.playerName, status: i.status })),
        ...(homeMatchExcluded
          ? Array.from(homeMatchExcluded).map(name => ({ playerName: name, status: "Out" }))
          : []),
      ],
      awayInjuries: [
        ...awayInjuries.map(i => ({ playerName: i.playerName, status: i.status })),
        ...(awayMatchExcluded
          ? Array.from(awayMatchExcluded).map(name => ({ playerName: name, status: "Out" }))
          : []),
      ],
    });
    const kitchenSlips = kitchenResult.slips;

    if (kitchenSlips.length === 0) {
      return { gameId, skipped: false, legs: 0, error: "no kitchen slips generated" };
    }

    // Bookie-specific variants built from scratch (not filtered from generic)
    const bet365Slips = kitchenResult.buildBookieSlips(BOOKIES.bet365);
    const dabbleSlips = kitchenResult.buildBookieSlips(BOOKIES.dabble);

    const allSlipSets = [
      { slips: kitchenSlips, bookie: "generic" },
      { slips: bet365Slips,  bookie: "bet365"  },
      { slips: dabbleSlips,  bookie: "dabble"  },
    ];

    const slipsToLog = allSlipSets.flatMap(({ slips, bookie }) =>
      slips
        .filter(s => s.legs.length > 0)
        .map(s => ({
          slipType: s.type,
          bookie,
          legs: s.legs.map(l => ({
            player:        l.player,
            teamAbbr:      l.teamAbbr,
            side:          l.side as "home" | "away",
            stat:          l.stat,
            statLabel:     l.statLabel,
            threshold:     l.threshold,
            avgStat:       l.avgStat,
            hitRate:       l.hitRate,
            reliability:   l.reliability,
            isOnForm:      l.isOnForm,
            isBounceBack:  l.isBounceBack,
            gamesAnalyzed: l.gamesAnalyzed,
            signalTotal:   l.signalTotal,
            prop:          l.prop,
            edge:          l.edge,
          })),
        }))
    );

    const totalLegs = slipsToLog.reduce((n, s) => n + s.legs.length, 0);

    await logSlips(
      {
        id:       gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        venue:    game.venue,
        gameDate: game.kickoff?.slice(0, 10),
        sport:    "afl",
      },
      slipsToLog,
    );

    return { gameId, skipped: false, legs: totalLegs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron/save-slips] ${gameId} error:`, msg);
    return { gameId, skipped: false, legs: 0, error: msg };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorised(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch today's AFL scoreboard (30s cache — fresh enough for cron)
    const events = await fetchESPNScoreboard("afl", 30);

    // Target: upcoming + live games (not finished — no point saving slips post-game)
    const targets = events.filter(ev => {
      const state = ev.status?.type?.state ?? ev.competitions?.[0]?.status?.type?.state;
      return state === "pre" || state === "in";
    });

    console.info(`[cron/save-slips] ${targets.length} AFL games to process`);

    // Process games sequentially to stay within Hobby 10s limit
    const results = [];
    for (const event of targets) {
      const result = await saveSlipsForGame(event);
      results.push(result);
      console.info(`[cron/save-slips] ${result.gameId} → ${result.skipped ? "skipped" : `${result.legs} legs saved`}${result.error ? ` (${result.error})` : ""}`);
    }

    return Response.json({
      ok:      true,
      games:   results.length,
      saved:   results.filter(r => !r.skipped && !r.error).length,
      skipped: results.filter(r => r.skipped).length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/save-slips] fatal:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
