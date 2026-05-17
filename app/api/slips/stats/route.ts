/**
 * GET /api/slips/stats
 * Returns all analytics data for the /analytics dashboard.
 * Local-only — reads data/local/slips.db.
 */

import {
  getOverallStats,
  getSlipHitStats,
  getReliabilityCalibration,
  getPlayerStatHitRate,
  getRecentGames,
} from "@/lib/local/slipDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [overall, slipStats, calibration, playerStats, recentGames] = [
      getOverallStats(),
      getSlipHitStats(),
      getReliabilityCalibration(),
      getPlayerStatHitRate(),
      getRecentGames(15),
    ];

    return Response.json({ ok: true, overall, slipStats, calibration, playerStats, recentGames });
  } catch (err: any) {
    console.error("[/api/slips/stats]", err);
    return Response.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
