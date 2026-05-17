# DegenHUB — AFL System

> AFL is the most complete sport in the system. Full analytics pipeline, kitchen, player profiles, and live intelligence.
> Read this before touching any AFL code.

---

## Route Map

| Route | File | Description |
|-------|------|-------------|
| `/game/afl-{id}` | `app/game/[id]/page.tsx` | AFL game detail page |
| `/player/afl/{athleteId}` | `app/player/[sport]/[athleteId]/page.tsx` | AFL player profile |
| `/api/afl/player/{athleteId}` | `app/api/afl/player/[athleteId]/route.ts` | AFL player analytics API |

---

## Game Detail Page

### Data fetched (server component)

The game detail page (`app/game/[id]/page.tsx`) fetches in parallel:
- ESPN game summary (boxscore, play-by-play, rosters)
- Home and away squad data from ESPN/club roster
- H2H history (last 10 head-to-head games)
- AFL analytics (predicted margin, form, insights)
- Weather conditions (BOM)
- Player prop odds (The Odds API — optional)

### AFL Dashboard Component

`components/afl/AFLDashboard.tsx` renders the Overview tab for AFL games.

**Pre-match mode** (3-column grid: `grid-cols-[260px_1fr_240px]` at `lg`):
```
LEFT (260px):   Home/Away squad lists with headshots
CENTRE (1fr):   Match header, kickoff time, form streaks, key stats, weather (large screens)
RIGHT (240px):  Model Pick + Key Edges (insights) + Weather (hidden at 2xl)
```

**Live/Finished mode**:
- Live score display with quarter-by-quarter breakdown
- Live player stats table
- SlipTracker showing which bet legs have hit

### GameDetailTabs (Client Component)

`app/game/[id]/GameDetailTabs.tsx` manages:
- Tab state (Overview / Kitchen / H2H)
- AFL kitchen drawer state (`aflKitchenDrawer`)
- `handleKitchenPlayerClick(playerName)` — looks up player in squads, fetches `/api/afl/player/{id}`, opens drawer
- `PlayerDrawer` overlay rendering

---

## AFL Roster Pipeline

**Authority**: `lib/sports/afl/clubRoster.ts` — authoritative current squad data

**ESPN squad**: Fetched from ESPN game summary (includes ESPN athlete IDs needed for stats)

**Reconciliation**: Club roster provides guernsey numbers and position data; ESPN provides the numeric athlete IDs used for history fetching.

**Headshot resolution** (`lib/aflPlayerImage.ts`):
1. Champion Data CDN (`lib/sports/afl/champIDImages.ts` — maps ESPN ID → Champion Data ID)
2. AFL official CDN
3. ESPN thumbnail fallback

---

## AFL Analytics Model

**File**: `lib/sports/afl/analytics.ts`

### Predicted Margin

Composite 4-factor model:
```
predictedMargin = (
  (homeAttack - awayDefence + awayAttack - homeDefence) × 0.35  // attack/defence
  + ladderDiff × 0.30                                             // ladder position
  + formDiff × 0.25                                              // recent form (last 5)
  + h2hEdge × 0.10                                               // H2H head-to-head
) + 5.0                                                           // home ground advantage
```

Displayed as: **"Richmond +4 pts"** in the Model Pick card.

`predictedMargin !== 0` guard was removed — the model pick always shows if `analytics?.predictedMargin != null`.

### Form Calculation

Last 5 games — win/loss percentage. Higher weight on more recent results.

---

## AFL Insights Engine

**File**: `lib/sports/afl/insights.ts`

Generates matchup intelligence bullets shown in "Key Edges" card. Signals include:
- Venue edge (home team's venue record)
- Weather impact (wind speed, rain)
- H2H trend (recent head-to-head dominance)
- Form momentum (streak analysis)
- Injury/absence impact

Displayed in the RIGHT column of AFLPreMatch. Always visible at `lg` breakpoint.

---

## AFL Kitchen

**Files**: `lib/sports/afl/kitchen.ts` + `components/afl/AFLKitchen.tsx`

For deep Kitchen documentation see `docs/KITCHEN_CONTEXT.md`.

### AFL-specific slip types

| Slip | Stats | Identity |
|------|-------|---------|
| Safe | D, G, M, T | High-probability consistency plays |
| Doable | D, G, M, T | Reliable picks, stronger returns |
| Goal Scorers | G | AFL forward trends |
| Disposals | D | Volume-possession plays |
| Ballsy | All | High-upside on-form plays |
| Value | All | Book line priced below projected avg |

### Stats tracked

| Code | Stat | Minimum avg |
|------|------|------------|
| D | Disposals | 8 |
| G | Goals | 0.35 |
| M | Marks | 2 |
| T | Tackles | 2 |
| HO | Hitouts | 3 |

### Value Picks during live games

During live AFL games, The Odds API suspends player props. The Kitchen falls back to `findBestThreshold` to derive a natural book line (no odds shown). This ensures value picks remain visible throughout the game.

### Player click → Drawer

Kitchen player names are `<button>` elements. Click triggers `onPlayerClick(name)` prop, which:
1. `GameDetailTabs.handleKitchenPlayerClick(playerName)` fires
2. Looks up player name in `homeSquad`/`awaySquad` (exact `displayName` match)
3. Determines `matchContext` (home/away), `opponent`, `teamId`
4. Fetches `GET /api/afl/player/{espnId}?matchContext=...&opponent=...&teamId=...`
5. Sets `aflKitchenDrawer` state → renders `<PlayerDrawer>` overlay

---

## AFL Player API

**Route**: `GET /api/afl/player/[athleteId]`

**Query params**:
- `matchContext`: `"home"` | `"away"`
- `opponent`: opponent team name or abbreviation
- `teamId`: ESPN team ID (required — used to fetch correct schedule)

**What it returns** (`AFLPlayerAnalyticsResult`):
- Player profile (name, headshot, position, guernsey)
- Game history (last 10 games with per-game stats)
- Season averages (D, G, M, T, HO per game)
- Reliability scores per stat category
- isOnForm / isBounceBack flags
- Match context edge analysis (vs this opponent)

**Implementation files**:
- `lib/sports/afl/players/history.ts` — fetches game log from ESPN
- `lib/sports/afl/players/analytics.ts` — computes reliability, form, bounce-back
- `lib/sports/afl/players/types.ts` — `AFLPlayerAnalyticsResult` type
- `lib/sports/afl/players/transforms.ts` — raw ESPN data → normalized stats

---

## AFL Player Profile Page

**Route**: `/player/afl/{athleteId}?teamId={teamId}&from={source}&homeAway={homeAway}&opponent={opponent}`

**Required param**: `teamId` (needed to fetch correct team schedule)

**Renders**: `PlayerProfileContent` — full AFL analytics display including:
- Career/season stat averages
- Game-by-game log (last 10 games with D/G/M/T/HO bars)
- Reliability breakdown per stat
- On-form / bounce-back indicators
- Opponent matchup edge

Middle-click on player names in the Kitchen opens the profile page in a new tab (handled in `GameDetailTabs` with `onAuxClick`).

---

## AFL SlipTracker

**File**: `lib/sports/slipTracker.ts`

Used during live games to track which Kitchen bet legs have already hit.

A leg is considered "hit" when the player's live stat has exceeded the recommended threshold. Displayed in the Kitchen UI with a green check.

---

## AFL Weather

**File**: `lib/sports/weather.ts`

Fetches from BOM (Bureau of Meteorology) for Australian venues.

**Condition labels**: Clear, Partly Cloudy, Overcast, Light Rain, Heavy Rain, Windy, Stormy, Indoor (Docklands/Marvel Stadium).

Weather card shown in:
- CENTRE column (all breakpoints)
- RIGHT column (`2xl:hidden` — only shown at lg/xl, hidden at 2xl+)

---

## Known AFL Quirks

1. **ESPN AFL athlete IDs** are different from Champion Data IDs. `champIDImages.ts` maintains the mapping.
2. **Squiggle standings** may lag by 1–2 days after round completion.
3. **Docklands/Marvel Stadium** always returns `condition: "Indoor"` — weather card is hidden for indoor venues.
4. **Player history minimum**: 5 games required for any slip inclusion. Early in the season, many players won't qualify.
5. **Disposals stat**: In ESPN data, disposals = kicks + handballs. The app computes this correctly from raw box score data.
