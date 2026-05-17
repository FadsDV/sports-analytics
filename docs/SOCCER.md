# DegenHUB — Soccer System

> Soccer uses Sofascore for player stats and has a Kitchen. Player profiles use the generic ESPN path.
> Read this before touching soccer code.

---

## Route Map

| Route | File | Description |
|-------|------|-------------|
| `/game/soccer-{tournamentId}-{id}` | `app/game/[id]/page.tsx` | Soccer game detail page |
| `/player/soccer/{athleteId}` | `app/player/[sport]/[athleteId]/page.tsx` | Soccer player profile |
| `/api/soccer/player/{playerId}` | `app/api/soccer/player/[playerId]/route.ts` | Soccer player stats API |

---

## Tournament IDs

Soccer game IDs include a tournament identifier. This is used to route to the correct ESPN sport path.

| Tournament | ESPN path |
|------------|-----------|
| A-League | `aus.1` |
| UCL | `uefa.champions` |
| UEL | `uefa.europa` |
| La Liga | `esp.1` |
| Bundesliga | `ger.1` |
| Generic | `all` |

The `tournamentId` is embedded in the game ID and extracted when the page loads to make the correct ESPN API calls.

---

## Data Sources

### ESPN (schedules, rosters, game structure)

Used for:
- Game schedule and match metadata
- Team rosters and player IDs
- Game status (live/upcoming/finished)
- Historical results

### Sofascore (player stats)

Used for:
- Per-match player statistics (shots, passes, tackles, saves, etc.)
- Player ratings (0–10 Sofascore match rating)
- Detailed stat breakdowns (on target, off target, corners, etc.)

**Important**: Sofascore requires TLS bypass. The API is not officially public and blocks standard `fetch` calls via TLS fingerprinting.

Implementation: `lib/sports/sofascore.ts` — uses `execSync('curl --insecure ...')` to bypass.

Sofascore player IDs are **different from ESPN IDs**. The soccer player API at `/api/soccer/player/[playerId]` accepts Sofascore player IDs.

---

## Soccer Kitchen

**Files**: `lib/sports/soccer/kitchen.ts` + `components/soccer/SoccerKitchen.tsx`

For deep Kitchen documentation see `docs/KITCHEN_CONTEXT.md`.

### Soccer-specific slip types

Soccer Kitchen uses `SLIP_CONFIG` to define the displayed categories:

| Key | Emoji | Title | Stat focus |
|-----|-------|-------|-----------|
| `safe` | 🔒 | Safe | High-probability picks |
| `doable` | ✅ | Doable | Solid returns |
| `shots` | 🏹 | Shots | Shot volume trends |
| `ballsy` | 🎲 | Ballsy | High-upside picks |
| `value` | 💎 | Value | Bookmaker edge plays |

The `shots` category replaced the legacy `creators` category. Do not revert to `creators`.

### Stats tracked in Soccer Kitchen

| Stat | Description |
|------|-------------|
| `goals` | Goals scored |
| `shots` | Total shots |
| `shotsOnTarget` | Shots on target |
| `assists` | Assists |
| `passes` | Passes completed |
| `tackles` | Tackles |
| `saves` | Goalkeeper saves |
| `corners` | Corner kicks |
| `scoreOrAssist` | Goal or assist (combined) |

### Value Picks Grid

Soccer value picks render in a `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3` grid.

Each ValuePickCard is a standalone `rounded-xl border border-border/30 bg-surface/40` card with gap spacing. Do not use the old border-cell approach (which caused visual cut-offs at grid edges).

---

## Soccer Player Profile

**Route**: `/player/soccer/{athleteId}`

Uses the generic `fetchNormalizedPlayerData("soccer", athleteId)` path (not AFL's dedicated analytics pipeline).

**Renders**: Generic game log display:
- Season stat averages
- Per-game stats from last 10 games

For tournament-specific players (UCL, UEL, etc.), the sport param may be the tournament key (e.g. `"ucl"`, `"uel"`, `"laliga"`) — these all route through the same generic handler.

---

## Soccer Player API

**Route**: `GET /api/soccer/player/[playerId]`

Accepts Sofascore player IDs.

Returns:
- Recent match stats from Sofascore
- Per-game breakdown (shots, goals, assists, passes, tackles, rating)

---

## Known Soccer Quirks

1. **Sofascore TLS bypass**: Must use curl. Any refactor that changes this to `fetch` will break soccer player stats.
2. **Player ID mismatch**: ESPN IDs ≠ Sofascore IDs. The soccer kitchen uses Sofascore IDs for player lookup.
3. **Tournament routing**: Soccer game IDs contain the tournament segment. Extracting it correctly is critical for ESPN API calls.
4. **Stat availability**: Not all Sofascore stats are available for all leagues. Lower-tier leagues may have fewer tracked stats.
5. **`creators` → `shots`**: The SLIP_CONFIG was updated. Do not reintroduce `creators` as a category key.
