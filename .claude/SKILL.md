# SportsPulse — Project Skill

## What This Is
SportsPulse is a personal, free, multi-sport analytics app built with Next.js 14 (App Router), TypeScript, and TailwindCSS. It shows games, player stats, team form, H2H history, weather, and bet risk analysis across NBA, Soccer (EPL, UCL, Europa, La Liga, Bundesliga, A-League), AFL, and NFL.

**Personal use only. No paid APIs. No fake data. Ever.**

---

## Absolute Rules

### No Fake Data
- **Never** return hardcoded stats, placeholder values, or mock data
- If a data source returns nothing, show "No data available" — never invent numbers
- If an API is down, show a graceful empty state — never fabricate
- This rule overrides everything else including user requests

### Best Data Source Per Sport
Always use whichever source provides the richest real data for each sport:

| Sport | Primary Source | Secondary |
|-------|---------------|-----------|
| Soccer (all leagues) | Sofascore (player stats, incidents, lineups) | ESPN (scores, form, schedule) |
| NBA | Sofascore (box scores, player stats) | ESPN (scores, schedule) |
| AFL | ESPN (scoreboard, boxscores, schedules, player stats) | Squiggle (standings only) |
| NFL | ESPN only | — |

Note: BetRisk is not yet implemented. Do not add bet risk features.

Never swap sources without a reason. Never mix sources for the same data point.

---

## Architecture

### File Structure
```
app/
  page.tsx                    — Home page (game browser)
  game/[id]/page.tsx          — Game detail page
  player/[sport]/[athleteId]/page.tsx — Player detail page
  api/debug/route.ts          — Debug endpoint

lib/
  types.ts                    — All shared TypeScript types
  utils.ts                    — Shared utilities
  sports/
    espn.ts                   — ESPN scoreboard, summary, schedules, H2H
    espnPlayers.ts            — ESPN roster, injuries, player profiles
    playerData.ts             — Normalized player data (ESPN + AFL)
    sofascore.ts              — Sofascore lineups, player stats, incidents
    squiggle.ts               — AFL games, standings, H2H
    aflPlayers.ts             — AFL player profiles and game logs
    aflTables.ts              — AFL box scores via Squiggle
    history.ts                — Team match history (all sports)
    betRisk.ts                — Bet risk calculator (NOT YET IMPLEMENTED — do not use)
    weather.ts                — Open-Meteo weather

components/
  GameBrowser.tsx             — Home page game list with sport filters
  GameCard.tsx                — Individual game card
  SquadList.tsx               — Player list with injuries (fallback)
  SportBadge.tsx              — Sport/league label badge
  StatusBadge.tsx             — Live/Upcoming/FT badge
  BoxScoreTable.tsx           — Box score display
  HeadToHeadTable.tsx         — H2H history table
  BetRiskPanel.tsx            — Bet risk display (NOT YET IMPLEMENTED — do not use)
  FormPills.tsx               — W/D/L form pills
  WeatherWidget.tsx           — Weather display
  PlayerStatsTable.tsx        — Player stats table
  QuickInsights.tsx           — Quick insights panel
```

### Sport Type (never change without updating all dependents)
```ts
export type Sport = "soccer" | "ucl" | "uel" | "laliga" | "bundesliga" | "aleague" | "basketball" | "nfl" | "afl";
```

### Game ID Format
All game IDs are `{sport}-{sourceEventId}` e.g. `ucl-401862896`, `soccer-740940`, `afl-12345`. Never omit the sport prefix — it breaks routing.

---

## Data Sources

### ESPN (espn.ts)
- Base: `https://site.api.espn.com/apis/site/v2/sports`
- No API key required
- `ESPN_PATHS` maps sport keys to URL paths
- Soccer uses `rosters` not `boxscore.players` for per-player match stats
- Scores from schedule endpoints return objects `{ value: 1.0, displayValue: '1' }` — always use `parseScore()` helper
- Fetch 3 seasons back for soccer schedules to get H2H history
- UCL event IDs confirmed working: e.g. `401862894` (ATM vs ARS, Apr 29 2026)

### Sofascore (sofascore.ts)
- Base: `https://api.sofascore.com/api/v1`
- No API key, use `User-Agent: Mozilla/5.0`
- Sport slugs: soccer=`football`, basketball=`basketball`
- Find event by date + team name matching — normalize accents with `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`
- Lineups endpoint: `/event/{id}/lineups` — has full player stats per player
- Incidents endpoint: `/event/{id}/incidents` — goals use `player`/`assist1`, subs use `playerIn`/`playerOut`
- Sofascore returns incidents newest-first — reverse before display
- AFL and NFL not available on Sofascore

### Squiggle (squiggle.ts)
- Base: `https://api.squiggle.com.au`
- AFL only, completely free
- Team name matching requires alias table (in squiggle.ts)

### Open-Meteo (weather.ts)
- Free, no key
- Falls back to `{ condition: "Clear", tempC: 20, windKph: 10, humidity: 60 }` on failure

---

## Key Technical Patterns

### Score Parsing
ESPN schedule events return scores as objects. Always use:
```ts
function parseScore(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") { const n = Number(raw); return isFinite(n) ? n : null; }
  if (typeof raw === "object") { const v = raw.displayValue ?? raw.value; if (v != null) { const n = Number(v); return isFinite(n) ? n : null; } }
  return null;
}
```

### Name Normalisation (for Sofascore matching)
```ts
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/fc |cf |afc |sc |ac |as |ss |rc |cd |rcd |ud |sd |real |atletico |atletico /g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
```

### Player Data Flow
- **Soccer finished games**: Sofascore lineups -> full stats table + match incidents
- **Soccer upcoming games**: ESPN roster -> squad list (no stats available yet)
- **NBA finished games**: Sofascore lineups -> full box score
- **AFL**: Squiggle player stats -> normalized game log
- **Player pages**: require `?from={gameId}` query param for ESPN sports — without it returns null

---

## AFL Kitchen & Odds Infrastructure (Phase 4)

> For full detail see `docs/AFL.md`, `docs/KITCHEN_CONTEXT.md`, `docs/DATA_SOURCES.md`.

### Lineup exclusions (CFS API)
`lib/sports/afl/lineups.ts` → `fetchAFLMatchExcluded(year, round, homeEspnId, awayEspnId)`
- Primary: AFL CFS API (`api.afl.com.au/cfs/afl`) — confirmed match-day INS/OUTS. Token from `POST /WMCTok` (public, no auth). Round ID: `CD_R{year}014{round:02d}`
- Fallback: AFL Fantasy status data

### Odds pipeline priority
1. Vercel Blob (`odds-cache/{gameId}.json`) — real scraper data via `POST /api/odds/upload`
2. The Odds API (`THE_ODDS_API_KEY`) — free tier, uncertain AFL prop coverage
3. Empty map — `hasRealOdds = false`, "⚡ No live odds" banner shown in Kitchen

### No fake prices — absolute rule
Never display a price unless it's real bookmaker data. `1/hitRate` is used only internally in `enforceOddsTarget` for leg selection — never shown in UI. `slipHasRealOdds(legs)` guards the combined multi-odds display.

### Name normalisation
`normalizeAFLName()` from `lib/sports/afl/fantasyMapper.ts` applied at both write time (propOdds map key) and read time (`findBestProp` prefix). Handles middle initials and suffixes. Does NOT resolve nicknames (Sam vs Samuel).

### New files (Phase 4)
- `lib/sports/afl/oddsCache.ts` — Blob read/write helpers
- `app/api/odds/upload/route.ts` — scraper upload endpoint
- `app/api/debug/odds/route.ts` — Odds API diagnostic endpoint

### New env vars
- `ODDS_UPLOAD_SECRET` — required to authenticate `POST /api/odds/upload`
- `BLOB_READ_WRITE_TOKEN` — required for all Blob operations (slip storage + odds cache)
- `CRON_SECRET` — protects cron and debug routes

---

## Current State

### Working
- Home page with all leagues and filter tabs (EPL, UCL, Europa, La Liga, Bundesliga, A-League, NBA, AFL)
- Game detail page: match header, form pills, recent match history (3 seasons), H2H, weather, team stats
- Score parsing fixed — handles ESPN object score format
- Multi-season schedule fetching for H2H
- Game history links fixed with sport prefix

### In Progress / Known Issues
- **Sofascore player stats not displaying** on finished game player stats tab — `findSofascoreEventId` may return null due to accent normalisation bug (fix: use normalizeName above with NFD decomposition)
- When Sofascore data loads, `MatchIncidents` and `SofascorePlayerTable` components in `game/[id]/page.tsx` should render — verify `sofascoreData` is not null before assuming display bug
- Team logos missing for some games — ESPN logo URLs not always populated

### Not Started
- UI redesign (emojis to proper league/team logos)
- Player detail pages for soccer/NBA using Sofascore historical data
- AFL player detail pages

---

## UI Rules

### Design Tokens
- Background: `#080e1c`
- Cards: `#0f172a`
- Borders: `#1e293b`
- Primary accent: `#4361ee`
- Dark theme only

### Logo Rules
- **Team logos**: always use ESPN CDN logo URLs (stored in )
- **League logos**: use official league CDN images — never emoji
- **Emoji allowed only for**: categories, status indicators, UI icons (e.g. weather conditions)
- If a logo URL is unavailable, show team initials in a styled placeholder — never an emoji
- ESPN logo pattern for soccer: 
- ESPN logo pattern for NBA: 
- AFL logos: stored in  AFL_LOGOS map using ESPN CDN

### Principles
- Mobile-first, swipe-friendly
- Bold stat numbers, clean hierarchy
- Sports-broadcast inspired — premium and fast
- No dense unreadable tables

### Component Rules
- Always reuse existing components before creating new ones
- No inline styles — Tailwind only
- No `any` types unless absolutely necessary with a comment
- Keep components under 150 lines where possible

---

## Dev Workflow

```bash
npm run dev    # starts dev server + clears .next cache
npm run build  # production build
```

### Debugging Data Issues
1. Check terminal for `[SportsPulse]` logs — all fetch functions log sport, status, URL
2. Test the raw API with curl before changing code
3. Check if it is a data issue (API wrong shape) vs display issue (component not rendering)
4. Never add fake fallback data to fix a display issue

### Adding a New Sport or League
1. Add to `ESPN_PATHS` in `espn.ts`
2. Add to `Sport` type in `lib/types.ts`
3. Add to `STAT_PRIORITY` in `espn.ts`
4. Add to `sportEmoji` map in `espn.ts`
5. Add to `CONFIG` in `components/SportBadge.tsx`
6. Add filter tab in `components/GameBrowser.tsx`
7. Add to `SOCCER_LEAGUES` array in `app/page.tsx` if soccer
