# DegenHUB — Kitchen & Reliability System Context

This document explains how the player reliability scoring system and bet slip generator work.
Provide this file to any AI working on the Kitchen, player pages, or reliability-related code.

---

## 1. Architecture Overview

```
lib/sports/reliability/
  engine.ts      — Core reliability formula (sport-agnostic)
  types.ts       — TypeScript interfaces
  labels.ts      — Confidence tiers, labels, colors (shared UI layer)
  absence.ts     — Contextual bonus: teammate injuries, role changes

lib/sports/afl/
  kitchen.ts     — AFL bet slip generator (computeAFLKitchen)

lib/sports/nba/
  kitchen.ts     — NBA bet slip generator (computeNBAKitchen)

components/afl/AFLKitchen.tsx   — AFL Kitchen UI
components/nba/NBAKitchen.tsx   — NBA Kitchen UI
components/afl/PlayerDrawer.tsx — AFL player quick-view (uses same engine)
```

**Rule**: All reliability scoring goes through `lib/sports/reliability/engine.ts`.
Never duplicate scoring logic in components or other lib files.

---

## 2. Reliability Engine

### Formula

```
reliability = weightedHitRate × consistencyFactor × sampleFactor × minutesFactor
              + contextualBonus
```

All factors are 0–1. Final score is clamped to [0, 1].

### Factor breakdown

#### weightedHitRate
Recency-weighted fraction of games where the player cleared the threshold.
- Uses exponential decay with λ = 0.82
- Most recent game has weight 1.0, second most recent 0.82, third 0.82², etc.
- Window: last 10 games

#### consistencyFactor (CV-based)
Measures how consistent the player is relative to their average.
CV = standard deviation / average

| CV range   | Factor |
|------------|--------|
| < 0.15     | × 1.15 |
| < 0.25     | × 1.08 |
| < 0.40     | × 1.00 |
| < 0.55     | × 0.90 |
| ≥ 0.55     | × 0.78 |

#### sampleFactor
Penalises small sample sizes. Prevents overconfidence on 5-game windows.

| Games | Factor |
|-------|--------|
| 5     | 0.65   |
| 6     | 0.75   |
| 7     | 0.83   |
| 8     | 0.90   |
| 9     | 0.95   |
| 10+   | 1.00   |

**Important**: At minimum 5 games, the maximum possible reliability is ~0.747 (0.65 sample × 1.15 consistency × 1.0 WHR). Thresholds must account for this ceiling.

#### minutesFactor (NBA only)
Linear interpolation across minutes-per-game brackets.
AFL always uses 1.0 (no minutes factor).

| MPG bracket | Factor range |
|-------------|--------------|
| ≥ 34        | 1.00         |
| 28–34       | 0.85–1.00    |
| 22–28       | 0.65–0.85    |
| 18–22       | 0.50–0.65    |
| 12–18       | 0.35–0.50    |
| < 12        | 0.30–0.35    |

#### contextualBonus
Additive bonus (max +0.20) from absence-impact analysis.
Current signals: teammate absence improving usage, role change.
Designed to be pluggable — future signals (back-to-back, pace, matchup) bolt on here.

### Sport configs

```ts
AFL_CONFIG = { lambda: 0.82, gameWindow: 10, minGames: 5, useMinutesFactor: false }
NBA_CONFIG = { lambda: 0.82, gameWindow: 10, minGames: 5, useMinutesFactor: true  }
```

### computeReliability input/output

```ts
computeReliability({
  vals:            number[],   // historical stats, oldest first
  threshold:       number,     // the OVER line being evaluated
  avgMinutes?:     number,     // NBA only
  contextualBonus?: number,    // 0–0.20
  config?:         SportReliabilityConfig,
}): ReliabilityBreakdown

// ReliabilityBreakdown:
{
  weightedHitRate:   number,  // 0–1
  consistencyFactor: number,  // multiplier
  sampleFactor:      number,  // multiplier
  minutesFactor:     number,  // multiplier (1.0 for AFL)
  contextualBonus:   number,  // additive
  finalReliability:  number,  // 0–1 final score
}
```

---

## 3. Confidence Tiers

The 0–1 reliability score maps to a human-readable tier.
**Source of truth**: `lib/sports/reliability/labels.ts`

| Tier      | Reliability | Label      | Color   | Meaning                              |
|-----------|-------------|------------|---------|--------------------------------------|
| elite     | ≥ 0.85      | Elite      | Green   | Near-certain. Hits almost every game |
| high      | ≥ 0.70      | High       | Blue    | Very reliable. Should hit most times |
| strong    | ≥ 0.55      | Strong     | Teal    | Reliable with some variance          |
| risky     | ≥ 0.38      | Risky      | Amber   | Possible but uncertain               |
| longshot  | < 0.38      | Long Shot  | Red     | Bold pick. Low probability           |

**Always use `getConfidenceTier(reliability)` from `labels.ts`** — never hardcode tier logic in components.

---

## 4. Bet Slips — The Kitchen

### Philosophy

Each slip has a distinct betting identity. The system should feel like sharp betting intelligence, not a stat sorter.

| Slip          | Identity                                    |
|---------------|---------------------------------------------|
| Safe          | High-probability consistency plays          |
| Doable        | Reliable picks with stronger returns        |
| Goal Scorers  | Best attacking/scoring trends               |
| Disposals     | Volume-possession plays (AFL only)          |
| Point Scorers | Best scoring trends, minutes-adjusted (NBA) |
| Playmakers    | Rebounds + assists (NBA only)               |
| Ballsy        | High-upside trend/momentum plays            |
| Value         | Bookmaker lines priced below projected avg  |

### Threshold selection logic

The core function `findBestThreshold(vals, avg, stat, minHR, maxHR, minFraction, maxFraction)`:
- Searches for a threshold in `[avg × minFraction, avg × maxFraction]`
- Must achieve a flat hit rate between `minHR` and `maxHR`
- Among all qualifying thresholds, picks the **highest** (hardest beatable line that still passes)

### Slip tier configs

#### Safe (AFL and NBA)
```
minFlatHR: 0.80,  maxFlatHR: 1.00
minFraction: 0.50, maxFraction: 0.75
minReliability: 0.60
maxLegs: 3
```
**Intent**: Threshold set well below average. Player averages 25 disposals → suggest 18+.
Must hit 80%+ of games. Goal is near-certain individual legs.
3 legs at ~80% reliability = ~51% combined probability.

#### Doable (AFL and NBA)
```
minFlatHR: 0.68,  maxFlatHR: 1.00
minFraction: 0.75, maxFraction: 0.92
minReliability: 0.45
maxLegs: 3
```
**Intent**: Threshold 75–92% of average. A step harder than Safe.
Player averages 25 → suggest 21+. Reliable but with stronger potential odds.

#### Goal Scorers (AFL) / Point Scorers (NBA)
```
AFL:  minFlatHR: 0.65, minFraction: 0.40, maxFraction: 0.80, maxLegs: 4
NBA:  minFlatHR: 0.70, minFraction: 0.50, maxFraction: 0.82, maxLegs: 4
```
**Intent**: Stat-filtered. Same comfortable-below-average approach applied to goals/points.

#### Disposals (AFL) / Playmakers (NBA: REB + AST)
```
AFL:  minFlatHR: 0.72, minFraction: 0.55, maxFraction: 0.85, maxLegs: 5
NBA:  minFlatHR: 0.68, minFraction: 0.52, maxFraction: 0.85, maxLegs: 4
```
**Intent**: Volume-possession category. Slightly wider fraction range than Safe.

#### Ballsy
Two-pass build:

**Pass A — On-form players** (last 3 games avg ≥ season avg × 1.10):
```
minFlatHR: 0.25,  maxFlatHR: 0.60
minFraction: 1.10, maxFraction: 1.60
useRecentBase: true   ← fraction is applied to recentAvg, not season avg
formBonus: +0.05
```
**Intent**: Player averaging 18 in last 3 games vs 15 season avg → suggest 20+ (110% of recent form).
Threshold is above recent trend, not just above season average.

**Pass B — Regular bold picks** (fallback):
```
minFlatHR: 0.30,  maxFlatHR: 0.60
minFraction: 0.95, maxFraction: 1.50
```
**Intent**: Any player, threshold at or above season average. Risky but justified.

Merge: on-form legs get priority. Take top 3 by reliability. Max 3 legs.

#### Value Picks
**Different logic entirely — does NOT use findBestThreshold (for the primary prop path).**

Two branches in `buildValueLegs` (`lib/sports/afl/kitchen.ts`):

**Branch 1 — Real odds available (pre-match):**
```
For each player with a prop (prop.price >= 1.60 AND prop.line < player.avg):
  1. hitRate = calcHitRate(vals, prop.line)   ← uses ACTUAL book line
  2. If hitRate < 0.65 → skip
  3. edge = player.avg - prop.line
  4. score = (edge / player.avg) × prop.price × reliability
Sort by score descending. Take top 10.
```

**Branch 2 — No odds / live game fallback:**
```
When The Odds API suspends props during live games (propOdds Map is empty):
  1. findBestThreshold(vals, avg, stat, 0.65, 0.85, 0.65, 0.82)
  2. If found.hitRate < 0.65 → skip
  3. edge = avg - found.threshold
  4. If edge <= 0 → skip
  5. Generate leg WITHOUT prop field (no odds shown)
```

**Why this matters**: The Odds API suspends player props during live AFL games. Without the fallback, value picks disappear the moment a game starts. The fallback derives the natural book line using `findBestThreshold` so picks remain visible throughout the game.

**Intent**: Player averages 28 disposals, book line is 24.5 at 1.83 → edge of +3.5. The book is undervaluing the player. Show the raw edge clearly: `↑ 25+ disposals | avg 28.0 | +3.5 edge`.

The `edge` field on `KitchenLeg` is what drives the Value Picks UI display.

**Value Picks UI** (`components/afl/AFLKitchen.tsx`):
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3`
- Each card: `rounded-xl border border-border/30 bg-surface/40` (standalone cards, not border-cell grid)
- Card headline: `↑ {threshold}+ {statLabel}` in primary colour (most prominent element)
- Subline: `avg {avgStat} · {gamesAnalyzed}g · +{edge} edge` (muted)
- Odds price shown only if `leg.prop` exists (not in live fallback mode)

---

## 5. Player Name Click (AFL Kitchen)

All player names in `AFLKitchen` are rendered as `<button>` elements:

```tsx
<button
  onClick={() => onPlayerClick?.(leg.player)}
  className="text-xs font-semibold truncate text-left hover:underline hover:text-primary transition-colors"
>
  {lastName(leg.player)}
</button>
```

The `onPlayerClick?: (name: string) => void` prop flows through:
- `AFLKitchen` → `SlipCard` → `LegRow` (for slip legs)
- `AFLKitchen` → `ValuePicks` → `ValuePickCard` (for value picks)

In `GameDetailTabs.tsx`, `handleKitchenPlayerClick(name)` handles the click:
1. Looks up the player name in `homeSquad`/`awaySquad` by `displayName` (exact match)
2. Determines `matchContext` (home or away), `opponent`, `teamId`
3. Fetches `GET /api/afl/player/{espnId}?matchContext=...&opponent=...&teamId=...`
4. Sets `aflKitchenDrawer` state → renders `<PlayerDrawer>` overlay

Middle-click (`onAuxClick`) opens the full player profile page in a new tab.

---

## 6. Key UI Patterns

### Confidence badge (Kitchen and PlayerDrawer)
```tsx
// Always use getConfidenceTier() from labels.ts
const tier   = getConfidenceTier(reliability)
const colors = CONFIDENCE_COLORS[tier]

// Show: label + mini bar + percentage
// "STRONG  ████░░  72%"
```

### Combined hit chance (slip footer)
```
Hit chance ~68%    ~4.2x
```
- **"Hit chance"** = combined probability (each leg's reliability multiplied together)
- **"x"** = combined multi odds (all leg prices multiplied)
- These are independent values — show both, label them separately

### Value pick card layout
```
Milera  ADEL          STRONG ▓▓▓▓▓░ 72%
disposals · 5g
avg 27.8 → 24.5 line
+3.5 edge              @1.84
▓▓▓▓▓░░░░░░░░░
```

---

## 7. isOnForm / isBounceBack detection

Calculated in `buildProfiles()` inside each kitchen file:

```ts
const recent3      = vals.slice(-3)
const recentAvg    = mean(recent3)
const isOnForm     = recent3.length >= 3 && recentAvg >= avg * 1.10
const isBounceBack = lastGame < avg * 0.65 && avg >= MIN_AVG[stat] * 1.5
```

- **isOnForm**: Last 3 games average is 10%+ above season average → candidate for Ballsy Pass A
- **isBounceBack**: Last game was 35%+ below season average (and player is normally productive) → bounce-back candidate

These are displayed as symbols in the UI:
- `▲` (green) = on form
- `↺` (amber) = bounce-back candidate

---

## 8. Minimum qualifications

A player-stat combination is only eligible for any slip if:
- At least **5 games** of history
- Season average meets minimum: `D ≥ 8, G ≥ 0.35, M ≥ 2, T ≥ 2, HO ≥ 3` (AFL) / `PTS ≥ 8, REB ≥ 3, AST ≥ 2` (NBA)
- Same player can appear max **2 times per slip** (different stat or threshold)

---

## 9. Future contextual modules (plug-in architecture)

The `contextualBonus` field in the engine accepts any additive signal (max 0.20).
New modules should follow the pattern in `lib/sports/reliability/absence.ts`:
- Analyse external data
- Return a bonus value 0–0.20
- Pass to `computeReliability({ contextualBonus: bonus })`

**Planned signals** (not yet implemented):
- Back-to-back games (penalty)
- Rest days advantage (bonus)
- Opponent defensive rank (adjustment)
- Pace matchup (adjustment)
- Minutes spike detection (bonus)
- Usage increase after teammate absence (bonus)
