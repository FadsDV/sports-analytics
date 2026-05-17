# DegenHUB — Player Profiles

> Player profile page covers multiple sports but renders differently per sport.
> Read this before touching player profile code.

---

## Route

```
/player/[sport]/[athleteId]
```

**File**: `app/player/[sport]/[athleteId]/page.tsx` (server component)

---

## Supported Sports

| Sport param | Data source | Renderer | Notes |
|-------------|-------------|---------|-------|
| `afl` | ESPN + AFL roster pipeline | `PlayerProfileContent` (full analytics) | Requires `teamId` search param |
| `basketball` / `nba` | ESPN (team schedule traversal) | Generic game log | No `teamId` required |
| `soccer` | ESPN | Generic game log | |
| `ucl` | ESPN (UCL path) | Generic game log | |
| `uel` | ESPN (UEL path) | Generic game log | |
| `laliga` | ESPN (La Liga path) | Generic game log | |
| `bundesliga` | ESPN (Bundesliga path) | Generic game log | |
| `aleague` | ESPN (A-League path) | Generic game log | |

---

## Two Rendering Paths

### Path 1: AFL (Full Analytics)

**Condition**: `sport === "afl"`

**Required search params**:
- `teamId` — ESPN team ID (required for fetching correct schedule)
- `homeAway` — `"home"` | `"away"` (optional — affects matchup analysis)
- `opponent` — opponent team name (optional — used for head-to-head edge)
- `from` — source identifier (optional — for back navigation)

**Data pipeline**:
1. `fetchAFLPlayerHistory(athleteId, teamId)` → `lib/sports/afl/players/history.ts`
2. `computeAFLPlayerAnalytics(history, matchContext)` → `lib/sports/afl/players/analytics.ts`

**Renders**: `<PlayerProfileContent>` — full AFL analytics view:
- Player headshot, name, position, guernsey number
- Season averages: D / G / M / T / HO bars
- Game-by-game log (last 10 games) with per-game stat breakdown
- Reliability score per stat (with confidence tier badge)
- isOnForm / isBounceBack indicators
- Opponent matchup edge (if `opponent` provided)
- Career/recent average comparison

### Path 2: Generic ESPN Sports

**Condition**: `sport !== "afl"`

**No `teamId` required**.

**Data pipeline**:
- `fetchNormalizedPlayerData(sport, athleteId)` → `lib/sports/espn.ts`
- Looks up the ESPN path from `ESPN_PATHS` map using `sport` param

**Renders**: Inline generic display:
- Player name, team, position
- Season stat averages
- Recent game log (last 10 games) with raw stats

This path handles any sport defined in `ESPN_PATHS`. Adding a new ESPN sport only requires adding it to the `ESPN_PATHS` map.

---

## Player ID System

### AFL
- Player IDs are **ESPN numeric athlete IDs** (e.g. `4569231`)
- These are obtained from the game roster in the game summary API response
- Used for `/api/afl/player/{athleteId}` and the profile page

### NBA
- Also ESPN numeric IDs
- Same format as AFL IDs

### Soccer
- ESPN IDs for the player profile page
- Sofascore IDs for `/api/soccer/player/{playerId}` (different system!)

### CS2
- PandaScore player IDs — **not yet linked to player profiles**
- No `/player/cs2/` route exists yet

---

## Navigation to Player Profile

### From Kitchen (AFL)
Middle-click / `onAuxClick` on a player name in `AFLKitchen` opens the player profile in a new tab.

URL constructed in `GameDetailTabs.tsx`:
```typescript
const url = `/player/afl/${player.id}?teamId=${teamId}&homeAway=${homeAway}&opponent=${opponent}&from=kitchen`
```

### From Roster (AFL pre-match)
Clicking a player in the squad list opens the profile page.

### From Player Drawer
The PlayerDrawer shows inline analytics. A link inside the drawer opens the full profile page.

---

## PlayerDrawer vs. Profile Page

| | PlayerDrawer | Profile Page |
|--|-------------|-------------|
| Location | Overlay on game page | Dedicated page `/player/...` |
| Trigger | Click player name in Kitchen | Middle-click or direct link |
| Data | Same `/api/afl/player/` endpoint | Same pipeline |
| Content | Inline panel with key stats | Full-page analytics |
| Sports | AFL only | AFL + all ESPN sports |

---

## Adding a New Sport to Player Profiles

1. Add the ESPN path to `ESPN_PATHS` in `lib/sports/espn.ts`
2. The generic path automatically supports it
3. For full analytics (like AFL), you'd need:
   - A `lib/sports/{sport}/players/` analytics pipeline
   - A dedicated `GET /api/{sport}/player/[athleteId]` route
   - A dedicated renderer component (like `PlayerProfileContent` for AFL)
   - A branch in `app/player/[sport]/[athleteId]/page.tsx`

---

## Known Issues

1. **AFL `teamId` required**: Without it, the AFL branch cannot fetch the player's game history (ESPN requires team context). The page will fail or return empty if `teamId` is missing.
2. **No CS2 player profiles**: CS2 players appear in match rosters but have no profile page. This is planned for a future phase.
3. **Generic path limited**: The generic ESPN path shows raw stats only — no reliability scoring, no form analysis, no matchup intelligence. For NBA depth, a dedicated NBA analytics pipeline would be needed (similar to AFL).
