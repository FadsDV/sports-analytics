/**
 * GET /api/cron/resolve-outcomes
 *
 * Vercel cron job — runs daily at 11pm AEST (13:00 UTC).
 * Fetches today's finished AFL games, reads actual player stats from
 * the boxscore, and marks each saved slip leg as hit or miss.
 *
 * Safe to call multiple times — skips games with no saved slips or
 * games that are already fully resolved.
 * Also manually callable: GET /api/cron/resolve-outcomes
 */

import { type NextRequest } from "next/server";
import {
  fetchESPNScoreboard, fetchAFLBoxScoreForPicks,
} from "@/lib/sports/espn";
import { resolveOutcomes } from "@/lib/local/slipDb";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 10;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorised(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch today's AFL scoreboard
    const events = await fetchESPNScoreboard("afl", 30);

    // Target: finished games only
    const finished = events.filter(ev => {
      const state = ev.status?.type?.state ?? ev.competitions?.[0]?.status?.type?.state;
      return state === "post";
    });

    console.info(`[cron/resolve-outcomes] ${finished.length} finished AFL games`);

    const results = [];

    for (const event of finished) {
      const gameId = `afl-${event.id}`;

      try {
        // Fetch boxscore (cached 24h for finished games)
        const rows = await fetchAFLBoxScoreForPicks(String(event.id));

        if (!rows || rows.length === 0) {
          results.push({ gameId, status: "no-boxscore" });
          continue;
        }

        // Build stat lines from boxscore rows.
        // fetchAFLBoxScoreForPicks returns AFLGamePlayerStats[] with field "name"
        // (not "player"). Stats are direct properties (D, G, M, T, HO, K, H).
        const statLines = rows
          .filter(row => row.name && row.name !== "Unknown")
          .map(row => ({
            player: row.name,
            D:  row.D  ?? 0,
            G:  row.G  ?? 0,
            M:  row.M  ?? 0,
            T:  row.T  ?? 0,
            HO: row.HO ?? 0,
            K:  row.K  ?? 0,
            H:  row.H  ?? 0,
          }));

        if (statLines.length === 0) {
          results.push({ gameId, status: "no-stat-lines" });
          continue;
        }

        await resolveOutcomes(gameId, statLines);
        results.push({ gameId, status: "resolved", players: statLines.length });
        console.info(`[cron/resolve-outcomes] ${gameId} → resolved (${statLines.length} players)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron/resolve-outcomes] ${gameId} error:`, msg);
        results.push({ gameId, status: "error", error: msg });
      }
    }

    return Response.json({
      ok:      true,
      games:   results.length,
      resolved: results.filter(r => r.status === "resolved").length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/resolve-outcomes] fatal:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
