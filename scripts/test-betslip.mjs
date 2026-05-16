/**
 * Quick standalone test for the betslip analyzer (Gemini Vision).
 * Usage: node scripts/test-betslip.mjs <path-to-image>
 *
 * Requires GEMINI_API_KEY in .env.local or env
 * Free key: https://aistudio.google.com/app/apikey
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env.local manually
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
}

const PROMPT = `You are DegenHUB's AFL betting analyst — sharp, direct, and brutally honest.
Read this betslip image, extract every leg, and rate the slip using real AFL knowledge.

AFL BENCHMARKS — use these strictly:

GOALS (to score a goal = 1+ goals)
  "to score a goal" / anytime scorer / 1+ goals → SOLID for genuine forwards, RISKY for mids/backs
  2+ goals → RISKY unless elite key forward
  3+ goals → YIKES

  Key AFL forwards who score regularly: Harry McKay, Jeremy Cameron, Charlie Curnow,
  Tom Hawkins, Bailey Smith, Aaron Naughton, Sam Walsh does not kick many goals,
  Rhylee West is a midfielder not a key forward

DISPOSALS
  15–20 → SOLID, 21–27 → SOLID, 28–33 → RISKY, 34+ → YIKES

MARKS  1–4 → SOLID, 5–7 → RISKY, 8+ → YIKES
TACKLES  3–5 → SOLID, 6–8 → RISKY, 9+ → YIKES
HITOUTS  rucks only; < 20 → SOLID, 20–30 → RISKY, 30+ → YIKES

RATING LOGIC:
  "good"  → majority SOLID, at most 1 RISKY, no YIKES
  "risky" → mix of SOLID/RISKY or 2+ RISKY, no YIKES
  "wtf"   → any YIKES, OR combination is statistically near-impossible

Return ONLY valid JSON (no markdown fences):
{
  "legs": [
    {
      "playerName": "exact name",
      "team": "team abbr or null",
      "stat": "goals",
      "threshold": 1,
      "direction": "over",
      "odds": null,
      "rating": "SOLID|RISKY|YIKES",
      "reason": "one concise sentence",
      "aflContext": "player position, scoring frequency"
    }
  ],
  "overallRating": "good|risky|wtf",
  "ratingLabel": "Good Slip|High Risk|WTF who told you this shit",
  "summary": "2-3 blunt sentences on slip quality",
  "totalOdds": null
}`;

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node scripts/test-betslip.mjs <image-path>");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("\n❌  GEMINI_API_KEY not set.");
  console.error("   Get a free key at: https://aistudio.google.com/app/apikey");
  console.error("   Then add to .env.local:  GEMINI_API_KEY=your-key-here\n");
  process.exit(1);
}

const bytes     = fs.readFileSync(imagePath);
const base64    = bytes.toString("base64");
const ext       = path.extname(imagePath).toLowerCase();
const mimeType  = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

const genAI  = new GoogleGenerativeAI(apiKey);
const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log(`\n📋 Analysing: ${path.basename(imagePath)}\n`);

const result = await model.generateContent([
  PROMPT,
  { inlineData: { data: base64, mimeType } },
]);

const raw       = result.response.text();
const jsonMatch = raw.match(/\{[\s\S]*\}/);
const verdict   = JSON.parse(jsonMatch[0]);

const ICONS   = { SOLID: "✅", RISKY: "⚠️ ", YIKES: "💀" };
const OVERALL = { good: "✅  GOOD SLIP", risky: "⚠️  HIGH RISK", wtf: "💀  WTF WHO TOLD YOU THIS SHIT" };

console.log("═".repeat(58));
console.log(`  ${OVERALL[verdict.overallRating]}`);
console.log("═".repeat(58));
console.log(`\n${verdict.summary}\n`);

for (const leg of verdict.legs) {
  console.log(`${ICONS[leg.rating]} ${leg.playerName}${leg.team ? ` (${leg.team})` : ""}`);
  console.log(`   ${leg.threshold}+ ${leg.stat}  —  ${leg.rating}`);
  console.log(`   ${leg.reason}`);
  if (leg.aflContext) console.log(`   ℹ  ${leg.aflContext}`);
  console.log();
}

if (verdict.totalOdds) console.log(`Combined odds: ${verdict.totalOdds}`);
