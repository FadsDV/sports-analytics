# DegenHUB — Betslip Checker

> Upload any AFL betslip image → get an honest verdict on every leg.
> Read this before touching betslip code.

---

## What It Does

The Betslip Checker is an AI-powered tool that:
1. Accepts an uploaded betslip image (screenshot or photo)
2. OCRs the image using Google Gemini Vision
3. Analyses each leg against AFL benchmarks
4. Returns a verdict on each leg and an overall slip rating

---

## Route

| Route | File | Description |
|-------|------|-------------|
| `/betslip` | `app/betslip/page.tsx` | Betslip checker page |
| `POST /api/betslip/analyze` | `app/api/betslip/analyze/route.ts` | Analysis endpoint |

The page renders `<BetSlipChecker />` (`components/betslip/BetSlipChecker.tsx`) — a client component.

---

## API Endpoint

**Route**: `POST /api/betslip/analyze`

**Content-Type**: `multipart/form-data`

**Body**: `{ image: File }` — JPEG, PNG, WebP, or GIF

**Returns**: `BetSlipApiResponse` (defined in `lib/betslip/types.ts`)

```typescript
interface BetSlipApiResponse {
  ok: boolean;
  verdict?: SlipVerdict;
  error?: string;
}

interface SlipVerdict {
  legs: BetSlipLeg[];
  overallRating: "good" | "risky" | "wtf";
  ratingLabel: "Good Slip" | "High Risk" | "WTF who told you this shit";
  summary: string;  // 2–3 blunt sentences
  totalOdds: number | null;
}

interface BetSlipLeg {
  playerName: string;
  team: string | null;
  stat: "disposals" | "goals" | "marks" | "tackles" | "hitouts" | "behinds" | "kicks";
  threshold: number;
  direction: "over";
  odds: number | null;
  rating: "SOLID" | "RISKY" | "YIKES";
  reason: string;         // One sentence about the stat threshold
  aflContext: string;     // Player position + typical stat output
}
```

---

## AI Model: Google Gemini Flash

**Model**: `gemini-2.5-flash`

**Library**: `@google/generative-ai`

**Auth**: `GEMINI_API_KEY` environment variable

**Free tier**: 15 RPM / 1M tokens per month — no credit card required.

**Get key**: https://aistudio.google.com/app/apikey

---

## Rating System

### Per-Leg Ratings

| Rating | Meaning |
|--------|---------|
| `SOLID` | Threshold is achievable based on AFL benchmarks |
| `RISKY` | Possible but uncertain — threshold is tough |
| `YIKES` | Near-impossible — threshold is unreasonably high |

### AFL Benchmarks (hard-coded in the Gemini prompt)

**Disposals**:
- 15–27 → SOLID
- 28–33 → RISKY
- 34+ → YIKES

**Goals** (1+):
- Key forwards → SOLID
- Midfielders → RISKY
- Pure defenders/rucks → RISKY
- 2+ → RISKY
- 3+ → YIKES

**Marks**:
- 1–4 → SOLID
- 5–7 → RISKY
- 8+ → YIKES

**Tackles**:
- 3–5 → SOLID
- 6–8 → RISKY
- 9+ → YIKES

**Hitouts** (rucks only):
- <20 → SOLID
- 20–30 → RISKY
- 30+ → YIKES

### Overall Slip Ratings

| Rating | Label | Condition |
|--------|-------|-----------|
| `good` | "Good Slip" 🟢 | Majority SOLID, ≤1 RISKY, no YIKES |
| `risky` | "High Risk" 🟡 | 2+ RISKY or mixed, no YIKES |
| `wtf` | "WTF who told you this shit" 🔴💀 | Any YIKES, or statistically impossible combo |

---

## Roster Staleness Handling

Gemini's training data has a cutoff and may have outdated AFL roster information. The prompt explicitly instructs the model:

> "If a bookmaker has listed a player on this betslip, they ARE currently playing for one of the teams in this match. NEVER rate a leg as YIKES or flag it invalid because you think the player plays for a different club — your roster data is stale. Only judge the STAT THRESHOLD."

This prevents false YIKES ratings due to trades and transfers.

---

## Technical Details

- **Runtime**: Node.js (not Edge — Gemini SDK requires Node)
- **Max duration**: 30 seconds (Gemini Flash is fast but network latency varies)
- **Image handling**: Read as ArrayBuffer → convert to base64 → send as inline Gemini data
- **JSON extraction**: Gemini may wrap JSON in markdown fences. The route strips fences with a regex match on `/{[\s\S]*}/`

---

## UI Flow (`BetSlipChecker.tsx`)

1. User drags/clicks to upload an image
2. `POST /api/betslip/analyze` is called with the file
3. Loading state shown during analysis (~2–5 seconds)
4. Results rendered:
   - Overall rating banner (colour-coded)
   - Summary paragraph
   - Per-leg cards showing: player, team, stat, threshold, rating badge, reason, AFL context
5. User can upload a new slip to start over

---

## Known Limitations

1. **AFL only**: Benchmarks are hard-coded for AFL stats. NRL, rugby, soccer betslips will not be rated correctly.
2. **OCR accuracy**: Heavily stylised betslip screenshots (dark backgrounds, unusual fonts) may OCR incorrectly.
3. **No real odds data**: Gemini rates thresholds only — it does not compare against actual market pricing or value.
4. **Rate limits**: 15 RPM on free Gemini tier. Not a concern for personal use, but could be an issue if shared publicly.
5. **Image formats**: Only JPEG, PNG, WebP, GIF are supported. PDFs are not.
