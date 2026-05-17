# DegenHUB — CS2 Esports System

> CS2 is in a basic functional state. Match listing works; player analytics and match detail are planned.
> Read this before touching CS2 code.

---

## Current State

CS2 is the **newest and least complete** sport in the system.

**What works:**
- CS2 hub page (`/sports/cs2`) — live, upcoming, and past match listing
- CS2 match card (`CS2MatchCard`) — team names, scores, tournament info, map scores
- CS2 match detail page (`/sports/cs2/match/[id]`) — basic match info
- CS2 team page (`/sports/cs2/team/[slug]`) — team profile + match history

**What is NOT yet implemented:**
- Player analytics (no kill/death stats, rating tracking, etc.)
- Kitchen / bet slip generator for CS2
- Player profile page for CS2 players
- Map-specific analytics
- Live round-by-round data

---

## Route Map

| Route | File | Description |
|-------|------|-------------|
| `/sports/cs2` | `app/sports/cs2/page.tsx` | CS2 hub (live/upcoming/past) |
| `/sports/cs2/match/[id]` | `app/sports/cs2/match/[id]/page.tsx` | Match detail |
| `/sports/cs2/team/[slug]` | `app/sports/cs2/team/[slug]/page.tsx` | Team profile |

---

## Data Source: PandaScore

**File**: `lib/sports/cs2/client.ts`

**Base URL**: `https://api.pandascore.co`

**Auth**: `PANDASCORE_API_KEY` environment variable.

If `PANDASCORE_API_KEY` is not set, the CS2 page renders a "key not configured" message and returns empty data (graceful degradation).

### Free Tier Restrictions

**Critical**: Individual match endpoints (`/csgo/matches/{id}`) return **HTTP 403** on the free plan.

**Workaround**: `fetchCS2Match(id)` searches across the cached list results (live + upcoming + past) to find a match by ID. This adds no additional API calls since the lists are already cached from the hub page load.

This means CS2 match detail is limited to whatever data is included in list responses. Per-map player stats (which typically require the individual match endpoint) are unavailable on free tier.

### Cache Strategy

| Endpoint | Cache TTL |
|----------|-----------|
| `/csgo/matches/running` (live) | 30 seconds |
| `/csgo/matches/upcoming` | 5 minutes |
| `/csgo/matches/past` | 30 minutes |
| `/teams/{slug}` | 4 hours |
| Team match history | 2 hours |

---

## Data Model

### EsportsMatch

```typescript
interface EsportsMatch {
  id: string;              // Canonical: "cs2.match.{pandascoreId}"
  externalId: number;      // Raw PandaScore ID
  status: EsportsMatchStatus; // "live" | "completed" | "not_started" | "cancelled" | "postponed"
  scheduledAt: string | null;
  beginAt: string | null;
  endAt: string | null;
  tournament: EsportsTournament;
  homeTeam: EsportsTeam | null;
  awayTeam: EsportsTeam | null;
  winnerId?: string;       // Canonical team ID
  score: { home: number; away: number };  // Map wins (not round scores)
  numberOfGames: number;   // Best-of format (1, 2, 3, 5)
  gameType: "cs2";
  maps: CS2Map[];          // Per-map results
  streams: CS2Stream[];    // Live stream links
}
```

### CS2Map

```typescript
interface CS2Map {
  name: string;        // e.g. "Mirage", "Inferno", "TBA"
  homeScore: number;   // Rounds won by home team
  awayScore: number;   // Rounds won by away team
  winnerId?: string;   // Canonical team ID of map winner
  completed: boolean;
}
```

### EsportsTeam

```typescript
interface EsportsTeam {
  id: string;          // Canonical: "cs2.team.{slug}"
  externalId: number;
  name: string;        // e.g. "NAVI", "FaZe Clan"
  acronym: string;     // e.g. "NAVI", "FAZE"
  imageUrl?: string;   // Team logo
  players?: EsportsPlayer[];
}
```

---

## ID System

CS2 uses canonical IDs with prefixes to avoid collisions:
- Matches: `cs2.match.{pandascoreId}`
- Teams: `cs2.team.{slug}` (resolved via `lib/mappings/esports/index.ts`)
- Players: `cs2.player.{pandascoreId}`
- Tournaments: `cs2.tournament.{id}`

The canonical ID system is managed by `lib/mappings/esports/index.ts` and `lib/providers/esports/pandascore/normalization.ts`.

---

## Normalization Layer

All PandaScore-specific schema details are contained in `lib/sports/cs2/client.ts`.

UI components only import from `lib/esports/types` — never from PandaScore-specific code.

This isolation means swapping data providers (e.g. adding HLTV) only requires changes in the client/provider layer, not in components.

---

## Planned Future Features

These are in the backlog but not yet started:

### Player Analytics
- Kill/Death/Assist ratios
- Rating 2.0 (HLTV-style)
- Entry fragger vs. support vs. AWPer role classification
- Map-specific win rates
- Historical performance trends

### Kitchen / Bet Slips
- Player kill total markets (e.g. "15+ kills")
- Map handicap picks
- First kill / pistol round markets

### Match Detail
- Round-by-round timeline
- Economy tracking
- Utility usage stats
- Live map progression

### Live Event Rendering
- Real-time round state
- Live economy display
- Live kill feed

---

## Adding PandaScore Paid Tier

If `PANDASCORE_API_KEY` is upgraded to a paid tier:
1. Individual match endpoint (`/csgo/matches/{id}`) becomes available
2. `fetchCS2Match` can be updated to use direct endpoint instead of list search
3. Detailed player stats become available from match player results
4. Per-map player stats unlock

No changes needed in UI components — only `lib/sports/cs2/client.ts` needs updating.

---

## Known CS2 Quirks

1. **PandaScore uses "csgo" paths** — `api.pandascore.co/csgo/...` — even for CS2. Do not change this.
2. **TBD teams**: When a match hasn't been determined yet (e.g. early bracket stages), `opponents` may be empty. `normalizeTeam(null)` returns `null` — handle in UI.
3. **Number of games**: CS2 matches are Bo1, Bo2, Bo3, or Bo5. `numberOfGames` is the maximum, not rounds played.
4. **Stream sorting**: Streams are sorted official+main first. Always use `match.streams[0]` for the primary stream.
5. **`HLTV client`**: `lib/sports/cs2/hltv-client.ts` exists but is not in production use. It was scaffolded for a potential HLTV data source.
