/**
 * Text-based betslip test — no image file needed.
 * Feeds the slip content as text to Gemini and gets an analysis.
 *
 * Usage: GEMINI_API_KEY=your-key node scripts/test-betslip-text.mjs
 *
 * Free key (no credit card): https://aistudio.google.com/app/apikey
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env.local
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("\n❌  GEMINI_API_KEY not set.");
  console.error("   Get your FREE key (no credit card) at:");
  console.error("   👉  https://aistudio.google.com/app/apikey");
  console.error("\n   Then paste it in .env.local:");
  console.error("   GEMINI_API_KEY=AIza...\n");
  process.exit(1);
}

// ─── The betslip from the screenshot ─────────────────────────────────────────
const SLIP = `
Match: Carlton v Western Bulldogs
Legs:
1. Rhylee West to Score a Goal
2. Harry McKay to Score a Goal
3. Aaron Naughton to Score a Goal
`.trim();

const PROMPT = `You are DegenHUB's AFL betting analyst — sharp, direct, brutally honest.

Analyse this AFL betslip. Rate each leg and give an overall verdict.

⚠️ CRITICAL RULE — TRUST THE BETSLIP:
Your AFL roster knowledge may be outdated. Players get traded every off-season.
If a player appears on this slip, they ARE playing in this match. Never flag a leg
as invalid because you think the player is on a different team. Only judge the STAT THRESHOLD.

AFL BENCHMARKS:

GOALS — "to score a goal" means 1+ goals in the match:
  - Genuine key forwards (McKay, Naughton, Cameron, Hawkins, Curnow, Dale) → SOLID for 1+
  - Midfielders (West, Walsh, Cripps, Bontempelli) → RISKY for 1+
  - Pure defenders → RISKY for 1+
  - 2+ goals → RISKY   3+ goals → YIKES

DISPOSALS  15–27 → SOLID   28–33 → RISKY   34+ → YIKES
MARKS  1–4 → SOLID   5–7 → RISKY   8+ → YIKES
TACKLES  3–5 → SOLID   6–8 → RISKY   9+ → YIKES

RATING LOGIC:
  "good"  → majority SOLID, ≤1 RISKY, no YIKES
  "risky" → 2+ RISKY, mix of SOLID/RISKY, no YIKES
  "wtf"   → any YIKES, or statistically near-impossible combo

THE SLIP:
${SLIP}

Return ONLY valid JSON:
{
  "legs": [
    {
      "playerName": "...",
      "team": "...",
      "stat": "goals",
      "threshold": 1,
      "direction": "over",
      "odds": null,
      "rating": "SOLID|RISKY|YIKES",
      "reason": "one sentence",
      "aflContext": "player role and scoring frequency"
    }
  ],
  "overallRating": "good|risky|wtf",
  "ratingLabel": "Good Slip|High Risk|WTF who told you this shit",
  "summary": "2-3 blunt sentences",
  "totalOdds": null
}`;

console.log("\n🏉  DegenHUB Slip Checker — Test Run");
console.log("─".repeat(54));
console.log("Slip:");
SLIP.split("\n").forEach(l => console.log("  " + l));
console.log("─".repeat(54));
console.log("Calling Gemini Flash...\n");

const genAI  = new GoogleGenerativeAI(apiKey);
const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const result = await model.generateContent(PROMPT);
const raw    = result.response.text();

let verdict;
try {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no JSON block found");
  verdict = JSON.parse(jsonMatch[0]);
} catch (e) {
  console.error("❌  Failed to parse JSON response:");
  console.error(raw.slice(0, 800));
  process.exit(1);
}

const ICONS   = { SOLID: "✅", RISKY: "⚠️ ", YIKES: "💀" };
const OVERALL = {
  good:  "✅  GOOD SLIP",
  risky: "⚠️   HIGH RISK",
  wtf:   "💀  WTF WHO TOLD YOU THIS SHIT",
};

console.log("═".repeat(54));
console.log(`  ${OVERALL[verdict.overallRating]}`);
console.log("═".repeat(54));
console.log(`\n${verdict.summary}\n`);
console.log("─".repeat(54));

for (const leg of verdict.legs) {
  const icon = ICONS[leg.rating] ?? "❓";
  console.log(`\n${icon}  ${leg.playerName}${leg.team ? ` (${leg.team})` : ""}`);
  console.log(`    ${leg.threshold}+ ${leg.stat}  ·  ${leg.rating}`);
  console.log(`    ${leg.reason}`);
  if (leg.aflContext) console.log(`    ℹ  ${leg.aflContext}`);
}

console.log("\n" + "─".repeat(54));
console.log(`\n✅  Test complete — full image OCR works the same way via /betslip\n`);
