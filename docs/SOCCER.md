# DegenHUB — Soccer System

> Soccer is the second-most complete sport in the system after AFL. It has a full Kitchen, bookie
> filtering, slip logging/outcome tracking, and a player drawer with BetChecker.
> Read this entire file before touching any soccer code.

---

## Table of Contents

1. [Route Map](#route-map)
2. [Tournament IDs](#tournament-ids)
3. [Data Layer — Sofascore](#data-layer--sofascore)
4. [SofascoreGameLog Fields](#sofascoreGameLog-fields)
5. [SofascorePlayerSeasonStats Fields](#sofascoreplayerseasonstats-fields)
6. [SofascoreTeamStats Fields](#sofascoreteamstats-fields)
7. [Soccer Kitchen Architecture](#soccer-kitchen-architecture)
8. [Kitchen Signals](#kitchen-signals)
9. [Kitchen Slip Types](#kitchen-slip-types)
10. [Player Stat Configs (PLAYER_STATS)](#player-stat-configs-player_stats)
11. [Bookie Filtering](#bookie-filtering)
12. [Reliability Config (SOCCER_CONFIG)](#reliability-config-soccer_config)
13. [Slip Logging & Outcome Tracking](#slip-logging--outcome-tracking)
14. [Soccer Player Drawer](#soccer-player-drawer)
15. [Soccer Player API](#soccer-player-api)
16. [Known Gaps & Limitations](#known-gaps--limitations)
17. [Known Quirks](#known-quirks)

---

## Route Map

| Route | File | Description |
|-------|------|-------------|
| `/game/soccer-{tournamentId}-{id}` | `app/game/[id]/page.tsx` | Soccer game detail page (server component) |
| `/game/eng.1-{id}`, `/game/ucl-{id}`, etc. | same | Other tournament formats |
| `/player/soccer/{athleteId}` | `app/player/[sport]/[athleteId]/page.tsx` | Soccer player profile (generic) |
| `/api/soccer/player/[playerId]` | `app/api/soccer/player/[playerId]/route.ts` | Sofascore player stats API |
| `/api/slips/soccer-outcome` | `app/api/slips/soccer-outcome/route.ts` | Outcome resolution for finished soccer games |

---

## Tournament IDs

Soccer game IDs contain the ESPN tournament segment. Used to make the correct ESPN API call.

| Tournament | ESPN sport segment | isSoccer check |
|------------|-------------------|----------------|
| English Premier League | `eng.1` | yes |
| UEFA Champions League | `uefa.champions` (`ucl`) | yes |
| UEFA Europa League | `uefa.europa` (`uel`) | yes |
| La Liga | `esp.1` (`laliga`) | yes |
| Bundesliga | `ger.1` (`bundesliga`) | yes |
| A-League | `aus.1` (`aleague`) | yes |
| Generic | `all` | yes |

The `isSoccer` flag in `GameDetailTabs` is computed from the game ID prefix:
```ts
const isSoccer = ["soccer","ucl","uel","laliga","bundesliga","aleague"].includes(sport);
```

The Sofascore tournament ID (a numeric ID) is embedded in `sofascore.tournamentId` and is used
for player season stats lookups. It is different from the ESPN segment.

---

## Data Layer — Sofascore

**All soccer player stats come from Sofascore, not ESPN.**

ESPN is used for:
- Game schedules and match metadata
- Historical team results (`homeHistory`, `awayHistory` — score strings)
- Game status (live/upcoming/finished)
- Rosters (but Sofascore lineup IDs differ from ESPN IDs)

Sofascore is used for:
- Player lineups for each match
- Per-match player statistics (every field in `SofascoreGameLog`)
- Player season statistics (`SofascorePlayerSeasonStats`)
- Team season statistics (`SofascoreTeamStats`)
- Match incidents (goals, cards, substitutions)
- Top scorers per tournament

**Critical**: Sofascore requires TLS bypass. The API is not officially public and blocks standard
`fetch` via TLS fingerprinting. Implementation: `lib/sports/sofascore.ts` uses
`execSync('curl --insecure ...')`. **Never refactor this to use `fetch`.**

**Player ID mismatch**: Sofascore player IDs are not ESPN player IDs. The kitchen uses Sofascore IDs
throughout. The `SofascorePlayer.id` from lineup data is the Sofascore ID used for stat lookups.

---

## SofascoreGameLog Fields

Defined in `lib/sports/sofascore.ts`. All per-game stats for one player in one match.

| Field | Type | Sofascore API key | Used in Kitchen | Used in Drawer |
|-------|------|------------------|----------------|----------------|
| `eventId` | `number` | `id` | no | no |
| `date` | `string` | `startTimestamp` (converted) | no | yes display |
| `homeTeam` | `string` | `homeTeam.name` | no | yes display |
| `awayTeam` | `string` | `awayTeam.name` | no | yes display |
| `homeScore` | `number` | `homeScore.current` | no | yes display |
| `awayScore` | `number` | `awayScore.current` | no | yes display |
| `homeTeamId` | `number` | `homeTeam.id` | no | yes W/L calc |
| `awayTeamId` | `number` | `awayTeam.id` | no | yes W/L calc |
| `playerTeamId` | `number or null` | derived from playerTeamId param | no | yes W/L calc |
| `goals` | `number or null` | `goals` | yes | yes |
| `assists` | `number or null` | `goalAssist` | yes | yes |
| `rating` | `number or null` | `rating` | no | yes |
| `minutesPlayed` | `number or null` | `minutesPlayed` or `secondsPlayed/60` | rotation penalty | yes |
| `shots` | `number or null` | `totalShots` or `totalShot` | yes | no |
| `shotsOnTarget` | `number or null` | `onTargetScoringAttempt` | yes | yes |
| `keyPasses` | `number or null` | `keyPass` | setPieceBonus signal | yes |
| `passes` | `number or null` | `accuratePass` | no | no |
| `passAccuracy` | `number or null` | `accuratePassesPercentage` | no | no |
| `tackles` | `number or null` | `totalTackle` or `tackles` | yes | yes |
| `interceptions` | `number or null` | `interceptionWon` or `interceptions` | not a market | yes display |
| `yellowCards` | `number or null` | `yellowCard` | yes | no |
| `foulsCommitted` | `number or null` | `foulsCommitted` or `foulCommit` | yes | no |
| `saves` | `number or null` | `saves` or `totalSave` | yes GK only | no |
| `xG` | `number or null` | `expectedGoals` | not a market | yes display |
| `xA` | `number or null` | `expectedAssists` | no | no |

**`playerTeamId` resolution**: `fetchPlayerRecentGames` accepts a `playerTeamId` param.
If provided, it checks whether `homeTeamId === playerTeamId` to set the field. Without it,
`playerTeamId` is `null` and the drawer cannot determine W/L from the player's perspective.
Always pass `playerTeamId` when calling the player API.

**`scoreOrAssist` is derived** — not a field on the interface. Computed in `getVals()`:
```ts
(g.goals ?? 0) + (g.assists ?? 0)
// null if BOTH goals AND assists are null for that game
```

---

## SofascorePlayerSeasonStats Fields

Returned by `fetchPlayerSeasonStats()` and exposed via `/api/soccer/player/[playerId]`.

| Field | Sofascore API key | Notes |
|-------|------------------|-------|
| `appearances` | `appearances` | Total matches played |
| `minutesPlayed` | `minutesPlayed` | Season total |
| `goals` | `goals` | Season total |
| `assists` | `assists` | Season total |
| `rating` | `rating` | Season average Sofascore rating |
| `shotsOnTarget` | `onTargetScoringAttempt` | Season total |
| `totalShots` | `totalScoringAttempt` | Season total |
| `accuratePassesPercentage` | `accuratePassesPercentage` | Season average % |
| `keyPasses` | `keyPass` | Season total |
| `tackles` | `totalTackle` | Season total |
| `interceptions` | `interceptionWon` | Season total |
| `yellowCards` | `yellowCard` | Season total |
| `expectedGoals` | `expectedGoals` | Season total xG |
| `expectedAssists` | `expectedAssists` | Season total xA |

**Missing from season stats** (available in game log but not season stats interface):
- `foulsCommitted` — not fetched from season endpoint
- `saves` — not fetched from season endpoint (goalkeeper-specific; use game log instead)

---

## SofascoreTeamStats Fields

Used by the kitchen for match/team legs (corners, cards, team goals).

| Field | Notes |
|-------|-------|
| `matches` | Number of matches played — REQUIRED for per-game averages |
| `goalsScored` | Season total goals scored |
| `goalsConceded` | Season total goals conceded |
| `shots` | Season total shots (may be null) |
| `shotsOnTarget` | Season total SOT (may be null) |
| `corners` | Season total corners (may be null) |
| `fouls` | Season total fouls (may be null) |
| `yellowCards` | Season total yellow cards (may be null) |
| `redCards` | Season total red cards (may be null) |
| `saves` | Season total GK saves (may be null) — used in opp rank proxy for shots |
| `averageBallPossession` | Avg possession % (may be null) |
| `accuratePassesPercentage` | Avg pass accuracy % (may be null) |

Always check `matches > 0` before dividing any team stat to get a per-game average.

---

## Soccer Kitchen Architecture

**Files**:
- `lib/sports/soccer/kitchen.ts` — all computation logic
- `components/soccer/SoccerKitchen.tsx` — rendering component
- `lib/sports/soccer/bookies.ts` — bookie filtering and snap logic

**Entry point**: `computeSoccerKitchen(input: SoccerKitchenInput): SoccerKitchenSlip[]`

**Input** (`SoccerKitchenInput`):
```ts
{
  homeAbbr, awayAbbr, homeTeamName, awayTeamName,
  homeHistory,   // ESPN TeamHistoryGame[] — score strings
  awayHistory,   // ESPN TeamHistoryGame[] — score strings
  homeTeamStats, // SofascoreTeamStats | null
  awayTeamStats, // SofascoreTeamStats | null
  players,       // SoccerPlayerProfile[] — current lineup with game logs
  weather?,      // { condition, windKph } | null
  homeRestDays?, // days since last game
  awayRestDays?,
  propOdds?,     // Map<"playerName|stat", SoccerProp> — always null (no prop data source)
}
```

**Flow**:
1. `buildMatchLegs(input)` — team totals, BTTS, corners from ESPN history + Sofascore team stats
2. `buildCardMatchLegs(input)` — total cards from Sofascore team stats
3. `buildPlayerProfiles(input)` — per-player reliability profiles across all stats
4. `buildPlayerLegs(profiles, tierConfig)` — filter and rank profiles for each slip tier
5. Assemble 6 `SoccerKitchenSlip[]` outputs

**Player data flow**:
- `SoccerPlayerProfile.games` = last 8 `SofascoreGameLog[]` from `fetchPlayerRecentGames`
- Minimum 3 games required to build a profile (`p.games.length < 3` skips the player)
- Minimum 3 non-null values for the specific stat (after `getVals` filter) skips the stat

---

## Kitchen Signals

Applied AFTER the reliability engine via uniform addition:
```ts
let rel = Math.max(0, Math.min(1.0, breakdown.finalReliability + signalTotal));
```

This is the **AFL-standard pattern**. Do NOT split signals between `contextualBonus` and
post-hoc negative adjustments. Always add the full `signalTotal` after the engine.

| Signal | Function | Range | Applies to |
|--------|----------|-------|------------|
| Opponent rank | `computeOpponentRankBoost(myAvg, oppConcededAvg)` | +/-0.10 | goals, scoreOrAssist, shots, SOT |
| Weather penalty | `computeWeatherPenalty(stat, weather)` | -0.08 to 0 | goals, shots, SOT, corners |
| Venue boost | `computeVenueBoost(side)` | +0.04 (home) / -0.02 (away) | all |
| Rest penalty | `computeRestDaysPenalty(restDays)` | -0.05 | all (if < 4 days rest) |
| Rotation penalty | `computeRotationPenalty(games)` | -0.12 | all (if <60 min in 3 of last 5) |
| Set piece bonus | `computeSetPieceBonus(player, stat)` | 0 to +0.08 | assists, scoreOrAssist (if high keyPasses) |
| Usage boost | `computeUsageBoost(player, allPlayers, stat)` | 0 to +0.05 | attacking stats |

**Opponent rank detail**:
- For `goals`/`scoreOrAssist`: uses `opponentStats.goalsConceded / matches` as the concession proxy
- For `shots`/`shotsOnTarget`: uses `(opponentStats.goalsConceded + saves) / matches` as shot-concession proxy
- Formula: `ratio = oppConcededAvg / myAvg`, boost = `clamp((ratio - 1.0) * 0.5, -0.10, +0.10)`

**Usage boost detail**:
- Only applies to: `goals`, `assists`, `scoreOrAssist`, `shots`, `shotsOnTarget`
- Counts teammates with `mean(goals + assists per game) >= 0.30`
- 0 such teammates: +0.05 (sole creator)
- 1 such teammate: +0.02 (thin attack)
- 2+ such teammates: 0 (normal competition)

**Set piece bonus detail**:
- Uses `keyPasses` average from `player.games`
- `keyPasses >= 2.0`: +0.08 for assists/scoreOrAssist
- `keyPasses >= 1.2`: +0.04 for assists/scoreOrAssist

---

## Kitchen Slip Types

`SoccerSlipType = "safe" | "doable" | "goalscorers" | "shots" | "cards" | "value"`

| Type | Key | Player stats | Match legs | Tier config |
|------|-----|-------------|-----------|-------------|
| Safe | `safe` | Any (high HR) | Team goals, BTTS (hitRate >=0.70) | HR 0.72-1.0, rel >=0.45, max 3 legs |
| Doable | `doable` | scoreOrAssist, goals, assists | Team goals (HR 0.58-0.70) | HR 0.55-0.78, rel >=0.28, max 3 legs |
| Goal Scorers | `goalscorers` | goals only | none | HR 0.30-0.80, rel >=0.12, max 4 legs |
| Shots | `shots` | shots, shotsOnTarget | none | HR 0.45-0.85, rel >=0.22, max 4 legs |
| Cards | `cards` | yellowCards | Total cards match legs | rel >=0.08, max 4 legs total |
| Value | `value` | All BETTABLE stats | none | Edge > 0, rel >=0.18 |

**BETTABLE stats for value**: `scoreOrAssist, goals, assists, shots, shotsOnTarget, tackles, yellowCards, foulsCommitted, saves`

**Player deduplication**: Max 1 leg per `player|stat` combination, max 2 legs per player across a slip.

**There is no "ballsy" slip type in soccer.** Ballsy is AFL-only. Do not add it to soccer.

---

## Player Stat Configs (PLAYER_STATS)

Defined as `PLAYER_STATS: PlayerStatConfig[]` in `kitchen.ts`.

| Stat | Key | Label | Step | Min Avg | Position filter |
|------|-----|-------|------|---------|----------------|
| `scoreOrAssist` | computed | "Score or Assist" | 0.5 | 0.25 | All |
| `goals` | `goals` | "Anytime Goalscorer" | 0.5 | 0.18 | All |
| `assists` | `assists` | "To Assist" | 0.5 | 0.15 | All |
| `shotsOnTarget` | `shotsOnTarget` | "Shots on Target" | 0.5 | 0.40 | All |
| `shots` | `shots` | "Player Shots" | 0.5 | 0.80 | All |
| `tackles` | `tackles` | "Player Tackles" | 1.0 | 1.0 | D, M only |
| `foulsCommitted` | `foulsCommitted` | "Fouls Committed" | 1.0 | 1.0 | All (incl. GK) |
| `yellowCards` | `yellowCards` | "Player Card" | 0.5 | 0.12 | All |
| `saves` | `saves` | "Goalkeeper Saves" | 0.5 | 1.0 | G only |

**Position detection**: `p.position.toUpperCase()[0]` gives the first letter.
- Sofascore positions map as: `Midfielder` -> M, `Defender` -> D, `Forward` -> F, `Attacker` -> A, `Goalkeeper` -> G
- "A" (Attacker) passes `foulsCommitted` (no posFilter) — intentional
- "A" (Attacker) fails `tackles` posFilter `["D","M"]` — intentional
- "G" (Goalkeeper) is gated out of attacking stats by `minAvg` — saves `posFilter: ["G"]` ensures GK-only

**`xG` is in `SoccerStatKey` but NOT in `PLAYER_STATS`**. It exists in the type for future use
but is not a bookmaker market and should not be added to `PLAYER_STATS` unless a market exists for it.

---

## Bookie Filtering

**File**: `lib/sports/soccer/bookies.ts`

After `computeSoccerKitchen()`, slips can be filtered to a specific bookie's valid lines:
```ts
filterSoccerSlipsForBookie(slips, SOCCER_BOOKIES.bet365)
```

### Bet365 SGM Config

| Stat | Available | Valid Lines | Snap |
|------|-----------|-------------|------|
| `goals` | yes | 0.5, 1.5, 2.5 | Snap down |
| `scoreOrAssist` | yes | 0.5, 1.5, 2.5 | Snap down |
| `assists` | yes | 0.5, 1.5 | Snap down |
| `shotsOnTarget` | yes | 0.5, 1.5, 2.5 | Snap down |
| `shots` | yes | 1.5, 2.5, 3.5 | Snap down |
| `yellowCards` | yes | 0.5, 1.5 | Snap down |
| `tackles` | no | none | Not available |
| `foulsCommitted` | no | none | Not available |
| `saves` | no | none | Not available |
| `xG` | no | none | Not available |
| `teamGoals` | yes | 0.5, 1.5, 2.5 | Snap down |
| `matchGoals` | yes | 1.5, 2.5, 3.5, 4.5 | Snap down |
| `btts` | yes | 0.5 (binary) | Nearest |
| `corners` | yes | 7.5, 8.5, 9.5, 10.5 | Snap down |
| `totalCards` | yes | 2.5, 3.5, 4.5 | Snap down |
| `totalShots` | no | none | Not available |

**Snap-down logic**: Find the highest valid line <= computed threshold. If none exists (threshold
below min valid line), the leg is dropped. For binary markets (btts), snap to nearest.

**Adding a new bookie**: Create a new `SoccerBookieConfig` following the `SOCCER_BET365` pattern,
add it to `SOCCER_BOOKIES`, and add its tab to the kitchen UI in `GameDetailTabs.tsx`.

---

## Reliability Config (SOCCER_CONFIG)

Defined in `lib/sports/reliability/engine.ts`:

```ts
export const SOCCER_CONFIG: SportReliabilityConfig = {
  lambda:           0.82,   // recency decay — older games weighted less
  gameWindow:       10,     // max games considered for weighted hit rate
  minGames:         5,      // below this: sample penalty kicks in
  sampleWeights:    DEFAULT_SAMPLE_WEIGHTS,
  cvBands:          DEFAULT_CV_BANDS,
  useMinutesFactor: false,  // minutes factor NOT implemented for soccer
};
```

**`useMinutesFactor: false`**: Soccer almost always plays 90 minutes so the AFL/NBA minutes
adjustment is not applied. However, a rotation penalty IS applied if a player gets subbed off
before 60 mins in 3+ of their last 5 games (`computeRotationPenalty`).

**Synthetic vals for match legs**: Corners and cards use synthetic arrays (all values = season avg)
since we only have season totals, not game-by-game data. This gives the engine a sample factor
based on `n = matches` but may overstate consistency (CV = 0 for synthetic data).

---

## Slip Logging & Outcome Tracking

Soccer slips are logged and outcomes resolved exactly like AFL, with sport-specific handling.

**Logging** (`useEffect` in `GameDetailTabs.tsx`):
- Gated on `isSoccer && soccerKitchenSlips.length > 0`
- Only logs `legType === "player"` legs — team/match legs cannot be resolved from lineup stats
- POSTs to `/api/slips/save` with `sport: "soccer"` in the game object
- Saved once per page load (`soccerSlipsSaved` ref prevents duplicate logging)

**Outcome resolution** (`useEffect` in `GameDetailTabs.tsx`):
- Gated on `isSoccer && game.status === "finished" && sofascore?.lineups`
- Reads player stats from `sofascore.lineups.home` and `sofascore.lineups.away`
- Only includes players with `minutesPlayed > 0`
- Sofascore lineup stat keys map to `SoccerStatLine` fields:

| `SoccerStatLine` field | Sofascore lineup stat key |
|------------------------|--------------------------|
| `goals` | `player.stats.goals` |
| `assists` | `player.stats.goalAssist` |
| `shots` | `player.stats.totalScoringAttempt` |
| `shotsOnTarget` | `player.stats.onTargetScoringAttempt` |
| `yellowCards` | `player.stats.yellowCard` |

**`scoreOrAssist` resolution**: `resolveSoccerOutcomes()` computes `goals + assists` server-side.
This is the only composite stat in the system.

**Analytics page**: `/analytics?sport=soccer` shows soccer-only data. All 5 DB query functions
(`getOverallStats`, `getSlipHitStats`, `getReliabilityCalibration`, `getPlayerStatHitRate`,
`getRecentGames`) accept an optional `sport` param that joins to the `games.sport` column.

---

## Soccer Player Drawer

**File**: `components/soccer/SoccerPlayerDrawer.tsx`

The drawer is opened two ways:

### Path 1: Player list click (no preData)
- `prePlayer: SofascorePlayer` is passed, `preData` is null
- Drawer fetches `/api/soccer/player/{id}?tournamentId=...&opponentTeamId=...`
- `data.vsOpponent` = raw `SofascoreGameLog | null` from API response
- `data.vsHistory` = `SofascoreGameLog[]` (up to 5 past matchups)

### Path 2: Kitchen player click (preData = SoccerPlayerAnalyticsResult)
- `preData: SoccerPlayerAnalyticsResult` is passed, no fetch happens
- `preData.vsOpponent` = `{ lastMatchup: SofascoreGameLog | null, history: SofascoreGameLog[] }`
- The drawer receives this as `data` via `useState(preData)`

When checking vsOpponent in the drawer, Path 1 gives `data.vsOpponent` as a `SofascoreGameLog`
(has `eventId`). Path 2 gives `data.vsOpponent` as `{ lastMatchup, history }` (has `lastMatchup`).
The drawer renders the Path 1 shape — kitchen click converts via `onSoccerKitchenClick` which
uses `preData.vsOpponent.lastMatchup` when building the `SoccerPlayerAnalyticsResult`.

### BetChecker

The `BetChecker` component (rendered at top of drawer) shows:
- Goal scorer reliability (threshold 0.5, using season avg and recent game log)
- Shots on target reliability (threshold 0.5 or 1.5 depending on season avg)

It uses the same `computeReliability` engine as the kitchen.

### Season Stats Shown

Goals, Assists, xG, xA, Shots, On Target, Key Passes, Tackles, Interceptions, Pass Accuracy.
`foulsCommitted` and `saves` are NOT shown in season stats (not in `SofascorePlayerSeasonStats`).

### Recent Game Log

Shows `SofascoreGameLog[]` as `GameLogRow` components. Each row displays:
- Date, W/L/D badge, score (uses `playerTeamId` for correct team perspective)
- Sofascore rating badge
- G (goals), A (assists), xG, SOT (shots on target), KP (key passes), TKL (tackles), INT (interceptions)

---

## Soccer Player API

**Route**: `GET /api/soccer/player/[playerId]`

All params are query strings:

| Param | Required | Description |
|-------|----------|-------------|
| `playerTeamId` | Strongly recommended | Sofascore team ID. Required for correct W/L display in drawer |
| `opponentTeamId` | Recommended | Sofascore team ID of opponent. Used to find vs-opponent match history |
| `tournamentId` | Recommended | Sofascore tournament ID. Required for season stats from the correct competition |

**Always pass `playerTeamId`**. Without it, `playerTeamId` on each `SofascoreGameLog` will be
`null` and the drawer cannot determine W/L from the player's perspective.

**Response**:
```ts
{
  seasonStats:  SofascorePlayerSeasonStats | null,
  tournamentId: number | null,
  seasonId:     number | null,
  recentGames:  SofascoreGameLog[],        // last 8 finished games
  vsOpponent:   SofascoreGameLog | null,   // most recent vs this opponent
  vsHistory:    SofascoreGameLog[],        // up to 5 past vs this opponent
}
```

---

## Known Gaps & Limitations

### G1: No Soccer Prop Odds Source
`SoccerKitchenInput.propOdds` is always `null`. The AFL kitchen fetches from The Odds API, but
soccer player props are not available on The Odds API for the leagues we support. The prop-gated
code paths in `buildPlayerLegs` are never exercised for soccer. If a prop data source is ever
added, it must follow the exact same `Map<"playerName|stat", SoccerProp>` format.

### G2: Minutes Factor Not Implemented
`SOCCER_CONFIG.useMinutesFactor = false`. The `minutesPlayed` field exists on every game log
but the reliability engine does not use it. A player subbed off at 45 mins gets the same
weight as a 90-min starter. The rotation penalty (`computeRotationPenalty`) partially compensates:
if a player played <60 mins in 3+ of their last 5 games, they get -0.12. This does not weight
individual game contributions differently — it's a blanket signal.

### G3: Match Legs Use Synthetic Vals
Corners and cards legs build synthetic arrays (all values = season avg per game) because we only
have team season totals from Sofascore, not game-by-game data. The engine returns a correct
sample-factor (based on N = matches) but CV is always 0 (synthetic data has no variance),
potentially making these legs appear more consistent than they really are.

### G4: `foulsCommitted` Has No Position Filter
`foulsCommitted` in `PLAYER_STATS` has no `posFilter`. Goalkeepers who average >=1.0 foul/game
(rare but possible) would get a fouls leg. Adding `posFilter: ["D","M","F","A"]` would be safer.

### G5: BetChecker Only Shows Goals + SOT
The drawer BetChecker is hardcoded to show Goal Scorer (0.5) and Shots on Target reliability.
For midfielders and defenders, the most relevant markets may be assists, tackles, or total shots.
A position-aware BetChecker would show different stats per position group.

### G6: vsHistory Not Rendered in Drawer
Phase 6 added `vsHistory` to the API response and populates it via `onSoccerKitchenClick`. The
drawer currently only renders the single most recent vs-opponent game. Multiple history entries
(up to 5) are fetched but not displayed yet.

### G7: Assists Opponent Rank Signal Uses Goals Proxy
`computeOpponentRankBoost` for `assists` goes through the goals branch (goalsConceded proxy).
A team's tendency to concede assists is not directly in `SofascoreTeamStats`. The signal is a
reasonable proxy but not targeted.

### G8: `scoreOrAssist` Outcome Stat Not in Season Stats
The season stats interface has `goals` and `assists` separately. `scoreOrAssist` is computed.
The BetChecker and season stats display can only show the component stats, not the combined figure.

---

## Known Quirks

1. **Sofascore TLS bypass**: Must use curl. Any refactor to use `fetch` will break soccer player stats entirely.

2. **Player ID mismatch**: ESPN IDs are not Sofascore IDs. The soccer kitchen uses Sofascore IDs throughout. Never use ESPN athlete IDs for Sofascore stat lookups.

3. **Tournament routing**: Soccer game IDs contain the tournament segment. Extracting it correctly is critical for ESPN API calls. The game ID format is `"soccer-{tournamentId}-{id}"` or `"eng.1-{id}"` etc.

4. **Stat availability by league**: Lower-tier leagues may have fewer stats on Sofascore. `foulsCommitted`, `saves`, `xG`, `interceptions` are most commonly absent. Always handle `null`.

5. **`creators` slip type is gone**: The slip type key was renamed to `shots`. `SoccerSlipType` does not contain `"creators"`. Do not reintroduce it.

6. **`ballsy` does not exist in soccer**: Ballsy is AFL-only. Soccer slip types are exactly: `safe | doable | goalscorers | shots | cards | value`.

7. **Sofascore `totalShots` vs `shots`**: The game log field is `shots` (sourced from `totalShots` or `totalShot` Sofascore keys). The season stat field is `totalShots`. Keep these names consistent when mapping.

8. **`goalAssist` is the Sofascore API key for assists**: In the raw Sofascore statistics object, assists are keyed as `goalAssist`, not `assists`. This mapping happens in `toGameLog()` and in `SoccerStatLine.assists <- player.stats.goalAssist`.

9. **Corners/cards outcome resolution**: `totalCards` and `corners` are match legs (not player legs). They are filtered out of slip logging (only `legType === "player"` is logged) and therefore never appear in the outcome tracking DB.

10. **Sofascore top scorers**: `SofascoreMatchData.topScorers` is fetched but is a league-level list, not match-specific. It is not currently used in the kitchen.

11. **`propOdds` is always null for soccer**: The `SoccerKitchenInput.propOdds` field and the prop-gated code paths in `buildPlayerLegs` exist for future use. No soccer prop data source is currently wired up.

12. **Season stats fetch requires `tournamentId`**: `fetchPlayerSeasonStats` needs the Sofascore tournament ID to find the right season. Without it, it falls back to iterating the player's season history. Always pass `tournamentId` from `sofascore.tournamentId`.
