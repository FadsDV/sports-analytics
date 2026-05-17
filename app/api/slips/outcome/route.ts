/**
 * POST /api/slips/outcome
 *
 * Called automatically when a FINISHED AFL game page loads.
 * Receives the final ESPN boxscore player stats, compares them against
 * every logged leg for that game, and marks each leg HIT or MISS.
 *
 * Idempotent — safe to call multiple times (only updates legs where hit IS NULL).
 */

import { type NextRequest } from "next/server";
import { resolveOutcomes, hasOutcomes, type LegOutcome } from "@/lib/local/slipDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as {
      gameId:   string;
      outcomes: LegOutcome[];
    };

    if (!body.gameId || !Array.isArray(body.outcomes)) {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    // Check if already resolved (avoid duplicate work)
    if (hasOutcomes(body.gameId)) {
      return Response.json({ ok: true, skipped: true, reason: "Already resolved" });
    }

    resolveOutcomes(body.gameId, body.outcomes);

    return Response.json({ ok: true, resolved: body.outcomes.length });
  } catch (err: any) {
    console.error("[/api/slips/outcome]", err);
    return Response.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
