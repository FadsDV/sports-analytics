/**
 * POST /api/slips/save
 *
 * Saves an AFL kitchen snapshot to the local SQLite database.
 * Called automatically when the Kitchen tab loads for an AFL game.
 * Local-only — data/local/slips.db is never committed to git.
 */

import { type NextRequest } from "next/server";
import { logSlips, type SlipLogGame, type SlipLogSlip } from "@/lib/local/slipDb";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as {
      game:  SlipLogGame;
      slips: SlipLogSlip[];
    };

    if (!body.game?.id || !Array.isArray(body.slips)) {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    logSlips(body.game, body.slips);

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/slips/save]", err);
    return Response.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
