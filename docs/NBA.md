# DegenHUB — NBA System

> NBA has a full kitchen and player analytics pipeline, but uses a different data strategy than AFL due to ESPN quirks.
> Read this before touching NBA code.

---

## Route Map

| Route | File | Description |
|-------|------|-------------|
| `/game/nba-{id}` | `app/game/[id]/page.tsx` | NBA game detail page |
| `/player/nba/{athleteId}` | `app/player/[sport]/[athleteId]/page.tsx` | NBA player profile |
| `/api/nba/player/{athleteId}` | `app/api/nba/player/[athleteId]/route.ts` | NBA player analytics API |

---

## Critical: ESPN NBA Data Quirk

**The ESPN `/basketball/nba/athletes/{id}` endpoint is broken for NBA.**

It returns stale data, wrong team associations, or empty game logs. Do NOT use direct athlete endpoints for NBA.

**Correct approach**: Full season traversal via team schedule.
1. Fetch team schedule (`/basketball/nba/teams/{teamId}/schedule?season={year}`)
2. For each game, fetch boxscore summary
3. Extract per-game stats for the target player from the boxscore

This is implemented in `lib/sports/nba/players/history.ts`.

---

## NBA Player History

**File**: `lib/sports/nba/players/history.ts`

### Strategy

Full-season traversal with incremental cache (`lib/sports/nba/players/cache.ts`):
- Fetches team schedule month by month
- Skips already-cached games (incremental)
- Groups by month to minimize API calls
- Returns last N games ordered by date

### ESPN boxscore quirks

In NBA boxscore summaries, the `score` field is sometimes:
- A string: `"108"`
- An object: `{ value: 108, displayValue: "108" }`

The normalizer in `lib/sports/espn.ts` handles both.

`seasonType` must be checked — only pull regular season + playoff games (not preseason).

---

## NBA Kitchen

**Files**: `lib/sports/nba/kitchen.ts` + `components/nba/NBAKitchen.tsx`

For deep Kitchen documentation see `docs/KITCHEN_CONTEXT.md`.

### NBA-specific slip types

| Slip | Stats | Identity |
|------|-------|---------|
| Safe | PTS, REB, AST | High-probability consistency plays |
| Doable | PTS, REB, AST | Reliable picks, stronger returns |
| Point Scorers | PTS | Best scoring trends, minutes-adjusted |
| Playmakers | REB + AST | Rebounds + assists combined |
| Ballsy | All | High-upside on-form plays |
| Value | All | Book line priced below projected avg |

### Stats tracked

| Code | Stat | Minimum avg |
|------|------|------------|
| PTS | Points | 8 |
| REB | Rebounds | 3 |
| AST | Assists | 2 |

### Minutes Factor

NBA is the only sport that uses `minutesFactor` in the reliability engine.

```
minutesFactor interpolated over MPG brackets:
≥ 34 MPG → 1.00
28–34    → 0.85–1.00
22–28    → 0.65–0.85
18–22    → 0.50–0.65
12–18    → 0.35–0.50
< 12     → 0.30–0.35
```

A player averaging 20 PPG but only getting 20 minutes will have their reliability penalised. This prevents low-minute scorers from appearing in slips with inflated confidence.

---

## NBA Player Profile Page

**Route**: `/player/nba/{athleteId}`

**No `teamId` required** (unlike AFL).

**Renders**: Generic game log display (not the full AFL analytics view):
- Season stat averages
- Game-by-game log (last 10 games)
- Basic form display

Uses `fetchNormalizedPlayerData("basketball", athleteId)` which works for any ESPN sport.

---

## NBA Player API

**Route**: `GET /api/nba/player/[athleteId]`

Returns:
- Player profile
- Game history (last 10 games)
- Season averages (PTS, REB, AST, MIN per game)
- Reliability scores with minutesFactor applied
- isOnForm / isBounceBack flags

---

## NBA Reliability Config

```typescript
NBA_CONFIG = {
  lambda: 0.82,
  gameWindow: 10,
  minGames: 5,
  useMinutesFactor: true
}
```

`useMinutesFactor: true` — only NBA uses this. AFL always uses `minutesFactor = 1.0`.

---

## Known NBA Quirks

1. **No direct athlete endpoint** — always use team schedule traversal (see above)
2. **Season year**: ESPN NBA uses the season end year (e.g. `2025` for 2024–25 season)
3. **Playoff games**: `seasonType === 3` for playoffs, `seasonType === 2` for regular season — both included in history
4. **Preseason** (`seasonType === 1`): Excluded from all analytics
5. **Bench players**: Any player averaging < 12 MPG gets heavily penalised by minutesFactor — unlikely to appear in slips
