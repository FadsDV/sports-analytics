/**
 * POST /api/betslip/analyze
 *
 * Accepts: multipart/form-data { image: File }
 * Returns: BetSlipApiResponse
 *
 * Uses Google Gemini Flash (free tier) to:
 *   1. OCR the betslip image into structured leg data
 *   2. Rate each leg against AFL benchmarks
 *   3. Produce an overall slip verdict
 *
 * Free API key: https://aistudio.google.com/app/apikey
 * No credit card required. 15 RPM / 1M TPM free.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NextRequest } from "next/server";
import type { BetSlipApiResponse, SlipVerdict } from "@/lib/betslip/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT = `You are DegenHUB's AFL betting analyst — sharp, direct, and brutally honest.
Read this betslip image, extract every leg, and rate the slip using real AFL knowledge.

⚠️ CRITICAL RULE — TRUST THE BETSLIP:
Your knowledge of AFL team rosters may be OUTDATED. Players get traded every off-season.
If a bookmaker has listed a player on this betslip, they ARE currently playing for one of the
teams in this match. NEVER rate a leg as YIKES or flag it invalid because you think the player
plays for a different club — your roster data is stale. Only judge the STAT THRESHOLD.

AFL BENCHMARKS — rate purely on whether the threshold is achievable:

DISPOSALS
  15–20 → SOLID   21–27 → SOLID   28–33 → RISKY   34+ → YIKES

GOALS (1+ = "to score a goal")
  Key forwards (McKay, Cameron, Curnow, Hawkins, Naughton, Dale, English scoring) → SOLID for 1+
  Midfielders (Walsh, Cripps, Bontempelli, Oliver, Merrett) → RISKY for 1+
  Pure defenders / rucks with no forward time → RISKY for 1+
  2+ goals → RISKY   3+ goals → YIKES

MARKS  1–4 → SOLID   5–7 → RISKY   8+ → YIKES
TACKLES  3–5 → SOLID   6–8 → RISKY   9+ → YIKES
HITOUTS  rucks only; <20 → SOLID   20–30 → RISKY   30+ → YIKES

RATING LOGIC:
  "good"  → majority SOLID, ≤1 RISKY, no YIKES
  "risky" → 2+ RISKY or mix, no YIKES
  "wtf"   → any YIKES, or statistically near-impossible combo

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "legs": [
    {
      "playerName": "exact name from slip",
      "team": "team abbreviation if clearly visible on slip, else null",
      "stat": "disposals|goals|marks|tackles|hitouts|behinds|kicks",
      "threshold": 25,
      "direction": "over",
      "odds": null,
      "rating": "SOLID|RISKY|YIKES",
      "reason": "one concise sentence about the stat threshold only",
      "aflContext": "player position and typical stat output for this metric"
    }
  ],
  "overallRating": "good|risky|wtf",
  "ratingLabel": "Good Slip|High Risk|WTF who told you this shit",
  "summary": "2-3 blunt sentences on slip quality",
  "totalOdds": null
}`;

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/app/apikey" } satisfies BetSlipApiResponse,
      { status: 500 },
    );
  }

  // Parse multipart form
  let imageBase64: string;
  let mimeType: string;

  try {
    const form   = await req.formData();
    const file   = form.get("image");
    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "No image provided" } satisfies BetSlipApiResponse, { status: 400 });
    }
    const fileObj  = file as File;
    const bytes    = await fileObj.arrayBuffer();
    imageBase64    = Buffer.from(bytes).toString("base64");
    const mime     = fileObj.type.toLowerCase();
    mimeType       = mime.includes("png") ? "image/png"
                   : mime.includes("webp") ? "image/webp"
                   : mime.includes("gif")  ? "image/gif"
                   : "image/jpeg";
  } catch (err) {
    console.error("[betslip] form parse error:", err);
    return Response.json({ ok: false, error: "Failed to read image" } satisfies BetSlipApiResponse, { status: 400 });
  }

  // Call Gemini Flash
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const raw = result.response.text();

    // Strip any markdown fences Gemini might add
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Gemini response");

    const verdict = JSON.parse(jsonMatch[0]) as SlipVerdict;
    return Response.json({ ok: true, verdict } satisfies BetSlipApiResponse);

  } catch (err: any) {
    console.error("[betslip] gemini error:", err);
    return Response.json(
      { ok: false, error: err?.message ?? "Vision API failed" } satisfies BetSlipApiResponse,
      { status: 502 },
    );
  }
}
