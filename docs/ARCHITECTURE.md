# DegenHUB — Architecture

> Full system architecture. Read this before modifying routes, API handlers, or data pipelines.

---

## Tech Stack

- **Framework**: Next.js 14 App Router
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS with custom design tokens
- **Rendering**: Server components by default; client components only where interactivity is needed
- **Caching**: Next.js `fetch` cache with `revalidate` TTLs per endpoint

---

## Directory Structure

```
sports-analytics/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home dashboard (sport selector + game cards)
│   ├── layout.tsx              # Root layout (nav, global styles)
│   ├── game/[id]/
│   │   ├── page.tsx            # Game detail page (server component, fetches all data)
│   │   ├── GameDetailTabs.tsx  # Client component (tabs: Overview, Kitchen, H2H)
│   │   └── AFLDashboard.tsx    # AFL-specific dashboard (re-export from components)
│   ├── player/[sport]/[athleteId]/
│   │   └── page.tsx            # Player profile page (server component)
│   ├── betslip/
│   │   └── page.tsx            # Betslip checker page
│   ├── debug/
│   │   └── page.tsx            # Debug/diagnostic page
│   ├── sports/cs2/
│   │   ├── page.tsx            # CS2 hub (live/upcoming/past matches)
│   │   ├── match/[id]/page.tsx # CS2 match detail
│   │   └── team/[slug]/page.tsx# CS2 team page
│   └── api/
│       ├── afl/player/[athleteId]/route.ts   # AFL player analytics endpoint
│       ├── nba/player/[athleteId]/route.ts   # NBA player analytics endpoint
│       ├── soccer/player/[playerId]/route.ts # Soccer player stats endpoint
│       ├── betslip/analyze/route.ts          # Gemini betslip analysis
│       ├── game/[id]/live/route.ts           # Live game polling endpoint
│       ├── odds/[sport]/route.ts             # Odds proxy endpoint
│       └── debug/route.ts                    # Debug diagnostics
│
├── components/
│   ├── afl/
│   │   ├── AFLDashboard.tsx    # Main AFL game view (pre-match / live / finished)
│   │   ├── AFLKitchen.tsx      # AFL Kitchen UI (slips + value picks)
│   │   ├── AFLPreMatch.tsx     # Pre-match layout with 3-col grid
│   │   ├── PlayerDrawer.tsx    # AFL player quick-view overlay
│   │   └── ...
│   ├── nba/
│   │   ├── NBAKitchen.tsx      # NBA Kitchen UI
│   │   └── ...
│   ├── soccer/
│   │   ├── SoccerKitchen.tsx   # Soccer Kitchen UI
│   │   └── ...
│   ├── cs2/
│   │   └── CS2MatchCard.tsx    # CS2 match card
│   └── betslip/
│       └── BetSlipChecker.tsx  # Betslip upload + analysis UI
│
├── lib/
│   ├── sports/
│   │   ├── espn.ts             # Core ESPN fetch utility (schedule, boxscores, roster)
│   │   ├── espnPlayers.ts      # ESPN player search and athlete endpoints
│   │   ├── sofascore.ts        # Sofascore player stats (soccer)
│   │   ├── squiggle.ts         # Squiggle API (AFL standings/ladder)
│   │   ├── weather.ts          # BOM + Open-Meteo weather
│   │   ├── history.ts          # Generic game history fetcher
│   │   ├── slipTracker.ts      # Live bet leg hit detection
│   │   ├── betRisk.ts          # Bet risk assessment logic
│   │   ├── reliability/
│   │   │   ├── engine.ts       # Core reliability formula (sport-agnostic)
│   │   │   ├── types.ts        # TypeScript interfaces
│   │   │   ├── labels.ts       # Confidence tiers (elite/high/strong/risky/longshot)
│   │   │   └── absence.ts      # Contextual bonus: teammate injuries
│   │   ├── afl/
│   │   │   ├── kitchen.ts      # AFL bet slip generator
│   │   │   ├── analytics.ts    # Predicted margin, composite model
│   │   │   ├── insights.ts     # Matchup intelligence engine
│   │   │   ├── roster.ts       # AFL roster fetching (ESPN + club sites)
│   │   │   ├── clubRoster.ts   # Authoritative roster data
│   │   │   ├── picks.ts        # Value pick identification
│   │   │   ├── players/
│   │   │   │   ├── history.ts  # Player game history fetcher
│   │   │   │   ├── analytics.ts# Per-player analytics computation
│   │   │   │   ├── types.ts    # AFL player types
│   │   │   │   └── transforms.ts
│   │   │   ├── champIDImages.ts# Champion Data image CDN mapping
│   │   │   └── fantasyMapper.ts
│   │   ├── nba/
│   │   │   ├── kitchen.ts      # NBA bet slip generator
│   │   │   ├── picks.ts        # Value pick identification
│   │   │   └── players/
│   │   │       ├── history.ts  # Full-season traversal (month-grouped)
│   │   │       ├── analytics.ts
│   │   │       ├── types.ts
│   │   │       └── cache.ts    # Incremental cache for game logs
│   │   ├── soccer/
│   │   │   └── kitchen.ts      # Soccer bet slip generator
│   │   ├── odds/
│   │   │   ├── engine.ts       # Odds fetching + normalization
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── cs2/
│   │       ├── client.ts       # PandaScore CS2 client
│   │       └── hltv-client.ts  # HLTV fallback (not in prod use)
│   ├── esports/
│   │   ├── types.ts            # EsportsMatch, EsportsTeam, EsportsPlayer
│   │   ├── normalization.ts    # Shared normalization utils
│   │   └── analytics/
│   ├── providers/
│   │   ├── odds/               # Odds provider abstraction (The Odds API)
│   │   └── esports/            # Esports provider (PandaScore)
│   ├── mappings/               # Canonical ID resolution (esports team/player IDs)
│   ├── images/                 # Image URL resolution helpers
│   ├── aflPlayerImage.ts       # AFL player headshot resolver
│   ├── core/
│   │   ├── types.ts            # Shared core types (GameState, etc.)
│   │   └── matchState.ts       # Match state helpers
│   └── types.ts                # Global types
```

---

## Data Flow

### Game Detail Page (`/game/[id]`)

```
page.tsx (Server Component)
  ├── Detects sport from ID prefix (afl-, nba-, soccer-)
  ├── Fetches: schedule, roster, H2H history, analytics, weather, odds
  └── Renders GameDetailTabs.tsx (Client Component)
        ├── Tab: Overview → AFLDashboard / NBADashboard / SoccerDashboard
        ├── Tab: Kitchen  → AFLKitchen / NBAKitchen / SoccerKitchen
        └── Tab: H2H      → H2HHistory component
```

### AFL Rendering Pipeline

```
AFLDashboard.tsx
  ├── Pre-match mode: AFLPreMatch
  │   ├── LEFT col (260px):  Squad lists (home/away with headshots)
  │   ├── CENTRE col (1fr):  Match header, form streaks, key stats
  │   └── RIGHT col (240px): Model Pick + Key Edges + Weather (hidden 2xl-)
  └── Live/Finished mode: Live score, quarter breakdown, live stats
```

### Player Profile Page (`/player/[sport]/[athleteId]`)

```
page.tsx (Server Component)
  ├── sport === "afl" →
  │     fetchAFLPlayerHistory + computeAFLPlayerAnalytics
  │     Renders: PlayerProfileContent (full AFL analytics)
  └── sport === "nba" | "soccer" | other ESPN sport →
        fetchNormalizedPlayerData(sport, athleteId)
        Renders: Generic game log + season stats
```

### Kitchen Player Click → Drawer

```
AFLKitchen renders player name as <button>
  → onPlayerClick(playerName)
    → GameDetailTabs.handleKitchenPlayerClick(name)
      → Looks up name in homeSquad/awaySquad (ESPNPlayer[])
      → GET /api/afl/player/{espnId}?matchContext=home&opponent=...&teamId=...
        → lib/sports/afl/players/history.ts + analytics.ts
      → Renders <PlayerDrawer> overlay
```

---

## Rendering Modes

### Server Components (default)
- All page routes (`app/*/page.tsx`)
- No interactivity — pure data fetch + render
- Use Next.js `revalidate` for cache control

### Client Components (`"use client"`)
- `GameDetailTabs.tsx` — tab switching, drawer state, live polling
- All Kitchen components — interactive slip building
- `BetSlipChecker.tsx` — file upload, API calls
- Player drawers — overlay state

---

## ID Conventions

Game IDs use sport prefixes:
- `afl-{espnId}` — AFL games (e.g. `afl-1133570`)
- `nba-{espnId}` — NBA games
- `soccer-{tournamentId}-{espnId}` — Soccer games
- `cs2.match.{pandascoreId}` — CS2 matches

Player IDs:
- ESPN numeric IDs for AFL/NBA/Soccer
- PandaScore IDs for CS2 (prefixed `cs2.player.{id}`)

---

## Cache Strategy

| Data | TTL | Method |
|------|-----|--------|
| Live scores | 30s | `revalidate: 30` |
| Upcoming games | 5 min | `revalidate: 300` |
| Game rosters | 5 min | `revalidate: 300` |
| Player history | 1–2 hr | `revalidate: 3600` |
| H2H history | 6 hr | `revalidate: 21600` |
| AFL standings | 1 hr | `revalidate: 3600` |
| CS2 live | 30s | `revalidate: 30` |
| CS2 past results | 30 min | `revalidate: 1800` |
| Team history | 2–4 hr | `revalidate: 7200` |
| Weather | 30 min | `revalidate: 1800` |

---

## Design Tokens

Tailwind custom classes used throughout:
- `bg-bg` — page background
- `bg-surface` — card/panel background
- `text-text-1` — primary text
- `text-text-2` — secondary/muted text
- `text-primary` — accent colour (blue/teal)
- `border-border` — standard border

AFL game page uses a **3-column grid** at large breakpoints:
```
grid-cols-[260px_1fr_240px]
```
- 260px: squad/roster column
- 1fr: main content
- 240px: analytics/intelligence column
