/**
 * POST /api/odds/upload
 *
 * Accepts real bookmaker odds from the local home-PC scraper and writes them
 * to Vercel Blob so the kitchen can use real prices immediately.
 *
 * Auth: Bearer {ODDS_UPLOAD_SECRET} env var.
 *       If ODDS_UPLOAD_SECRET is not set, all requests are rejected.
 *
 * Body (JSON):
 *   {
 *     gameId:    string,    // e.g. "afl-1133580"
 *     bookie:    string,    // "bet365" | "dabble" | "sportsbet" | "ladbrokes"
 *     timestamp: number,    // unix ms — used for staleness checks
 *     kickoffAt?: number,   // unix ms — optional event-aware freshness
 *     expiresAt?: number,   // unix ms — optional event-aware expiry
 *     legs: Array<{
 *       player: string,     // full player name as shown on bookie site
 *       stat:   string,     // "D" | "G" | "M" | "T" | "K" | "H" | "HO"
 *       line:   number,     // e.g. 20.5
 *       price:  number,     // decimal odds e.g. 1.85
 *     }>
 *   }
 *
 * Response 200: { ok: true, saved: number }
 * Response 400: { ok: false, error: string }
 * Response 401: { ok: false, error: "Unauthorized" }
 */

import { type NextRequest } from "next/server";
import { saveOddsToBlob, type OddsUploadPayload } from "@/lib/sports/afl/oddsCache";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.ODDS_UPLOAD_SECRET;
  if (!secret) return false; // always require a secret — don't allow open writes
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_STATS   = ["D", "G", "M", "T", "K", "H", "HO"];
const VALID_BOOKIES = ["bet365", "dabble", "sportsbet", "ladbrokes"];

function validatePayload(body: unknown): { ok: true; payload: OddsUploadPayload } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.gameId !== "string" || !b.gameId.startsWith("afl-")) {
    return { ok: false, error: "gameId must be a string starting with 'afl-'" };
  }
  if (typeof b.bookie !== "string" || !VALID_BOOKIES.includes(b.bookie)) {
    return { ok: false, error: `bookie must be one of: ${VALID_BOOKIES.join(", ")}` };
  }
  if (typeof b.timestamp !== "number") {
    return { ok: false, error: "timestamp must be a number (unix ms)" };
  }
  if (b.kickoffAt != null && typeof b.kickoffAt !== "number") {
    return { ok: false, error: "kickoffAt must be a number (unix ms) when provided" };
  }
  if (b.expiresAt != null && typeof b.expiresAt !== "number") {
    return { ok: false, error: "expiresAt must be a number (unix ms) when provided" };
  }
  if (typeof b.kickoffAt === "number" && typeof b.expiresAt === "number" && b.expiresAt <= b.kickoffAt) {
    return { ok: false, error: "expiresAt must be later than kickoffAt" };
  }
  if (!Array.isArray(b.legs) || b.legs.length === 0) {
    return { ok: false, error: "legs must be a non-empty array" };
  }

  for (let i = 0; i < b.legs.length; i++) {
    const leg = b.legs[i] as Record<string, unknown>;
    if (typeof leg.player !== "string" || !leg.player.trim()) {
      return { ok: false, error: `legs[${i}].player must be a non-empty string` };
    }
    if (typeof leg.stat !== "string" || !VALID_STATS.includes(leg.stat.toUpperCase())) {
      return { ok: false, error: `legs[${i}].stat must be one of: ${VALID_STATS.join(", ")}` };
    }
    if (typeof leg.line !== "number" || leg.line <= 0) {
      return { ok: false, error: `legs[${i}].line must be a positive number` };
    }
    if (typeof leg.price !== "number" || leg.price < 1) {
      return { ok: false, error: `legs[${i}].price must be ≥ 1.0 (decimal odds)` };
    }
  }

  return {
    ok: true,
    payload: {
      gameId:    b.gameId as string,
      bookie:    b.bookie as string,
      timestamp: b.timestamp as number,
      kickoffAt: b.kickoffAt as number | undefined,
      expiresAt: b.expiresAt as number | undefined,
      legs:      b.legs as OddsUploadPayload["legs"],
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  if (!isAuthorised(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validatePayload(body);
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const { payload } = validation;

  try {
    await saveOddsToBlob(payload);
    console.info(`[odds/upload] ${payload.gameId} ${payload.bookie}: ${payload.legs.length} legs saved`);
    return Response.json({ ok: true, saved: payload.legs.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[odds/upload] ${payload.gameId} error:`, msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
