/**
 * POST /api/hltv/upload
 *
 * Accepts HLTV match analytics from the local mini PC scraper and writes
 * them to Vercel Blob so the CS2 match page can display real data.
 *
 * Auth: Bearer {ODDS_UPLOAD_SECRET} env var.
 *
 * Body (JSON): HLTVMatchCache
 *   {
 *     matchId:    string,   // PandaScore canonical ID e.g. "cs2.match.12345"
 *     uploadedAt: number,   // unix ms
 *     homeTeam:   HLTVTeamData,
 *     awayTeam:   HLTVTeamData,
 *     h2h:        HeadToHead | null,
 *   }
 *
 * Blob path: hltv-match/{matchId}.json
 *
 * Response 200: { ok: true, url: string }
 * Response 400: { ok: false, error: string }
 * Response 401: { ok: false, error: "Unauthorized" }
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.ODDS_UPLOAD_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;
  if (typeof b.matchId !== "string" || !b.matchId.startsWith("cs2.match."))
    return 'matchId must start with "cs2.match."';
  if (typeof b.uploadedAt !== "number") return "uploadedAt must be a number";
  if (!b.homeTeam || typeof b.homeTeam !== "object") return "homeTeam required";
  if (!b.awayTeam || typeof b.awayTeam !== "object") return "awayTeam required";
  return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const err = validate(body);
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const payload = body as { matchId: string; [key: string]: unknown };
  const blobPath = `hltv-match/${payload.matchId}.json`;

  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(blobPath, JSON.stringify(payload), {
      access:      "public",
      contentType: "application/json",
      allowOverwrite: true,
    });

    console.info(`[hltv/upload] Stored ${payload.matchId} → ${blob.url}`);
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (e) {
    console.error("[hltv/upload] Blob write failed:", e);
    return NextResponse.json(
      { ok: false, error: "Blob write failed" },
      { status: 500 },
    );
  }
}
