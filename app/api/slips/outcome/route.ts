/**
 * POST /api/slips/outcome
 *
 * Called automatically when a FINISHED AFL game page loads.
 * Receives final ESPN boxscore player stat lines, then:
 *   - Fetches each logged leg's threshold from the DB
 *   - Computes hit = actualStat >= threshold SERVER-SIDE
 *   - Updates legs and rolls up slip hit counts
 *
 * Idempotent — only updates legs where hit IS NULL.
 *
 * DELETE /api/slips/outcome?gameId=afl-xxx
 *   Resets outcomes for a specific game (clears bad data).
 *
 * DELETE /api/slips/outcome?gameId=ALL
 *   Nuclear reset — clears all outcome data across all games.
 */

import { type NextRequest } from "next/server";
import {
  resolveOutcomes,
  resetOutcomes,
  resetAllOutcomes,
  hasOutcomes,
  type PlayerStatLine,
} from "@/lib/local/slipDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as {
      gameId:    string;
      statLines: PlayerStatLine[];
    };

    if (!body.gameId || !Array.isArray(body.statLines)) {
      return Response.json({ ok: false, error: "Invalid payload — expected { gameId, statLines[] }" }, { status: 400 });
    }

    // Check if already fully resolved
    if (await hasOutcomes(body.gameId)) {
      return Response.json({ ok: true, skipped: true, reason: "Already resolved" });
    }

    await resolveOutcomes(body.gameId, body.statLines);

    return Response.json({ ok: true, processed: body.statLines.length });
  } catch (err: any) {
    console.error("[/api/slips/outcome POST]", err);
    return Response.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const gameId = req.nextUrl.searchParams.get("gameId");
    if (!gameId) {
      return Response.json({ ok: false, error: "gameId param required" }, { status: 400 });
    }

    if (gameId === "ALL") {
      await resetAllOutcomes();
      return Response.json({ ok: true, reset: "ALL" });
    }

    await resetOutcomes(gameId);
    return Response.json({ ok: true, reset: gameId });
  } catch (err: any) {
    console.error("[/api/slips/outcome DELETE]", err);
    return Response.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
