/**
 * POST /api/slips/soccer-outcome
 *
 * Called automatically when a FINISHED soccer game page loads.
 * Receives final Sofascore lineup player stats, then:
 *   - Fetches each logged soccer leg's threshold from the DB
 *   - Computes hit = actualStat >= threshold SERVER-SIDE
 *   - Handles composite stats (scoreOrAssist = goals + assists)
 *   - Updates legs and rolls up slip hit counts
 *
 * Idempotent — only updates legs where hit IS NULL.
 */

import { type NextRequest } from "next/server";
import {
  resolveSoccerOutcomes,
  hasOutcomes,
  type SoccerStatLine,
} from "@/lib/local/slipDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as {
      gameId:    string;
      statLines: SoccerStatLine[];
    };

    if (!body.gameId || !Array.isArray(body.statLines)) {
      return Response.json(
        { ok: false, error: "Invalid payload — expected { gameId, statLines[] }" },
        { status: 400 }
      );
    }

    // Check if already fully resolved
    if (hasOutcomes(body.gameId)) {
      return Response.json({ ok: true, skipped: true, reason: "Already resolved" });
    }

    resolveSoccerOutcomes(body.gameId, body.statLines);

    return Response.json({ ok: true, processed: body.statLines.length });
  } catch (err: any) {
    console.error("[/api/slips/soccer-outcome POST]", err);
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
