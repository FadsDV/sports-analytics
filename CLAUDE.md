# DegenHUB — AI Working Guide

> **Read this first.** This file is the master index for all AI agents working on this codebase.
> Every feature and system has a dedicated doc in `/docs/`. Read the relevant doc before touching any system.

---

## Design Philosophy

Think **Bloomberg Terminal meets SofaScore** — professional analytics software for sports bettors.

**Focus on:**
- Readability and information density over decoration
- Real data from authoritative sources only
- Fast workflows for player research and matchup intelligence
- Sharp betting intelligence (not projections — edge identification)

**Never:**
- Add gimmicks, fake projections, or placeholder data
- Add UI clutter or decorative elements that don't carry information
- Duplicate data-fetching or scoring logic across files
- Invent data when APIs are unavailable — show nothing or a clear empty state

## 🚫 ABSOLUTE RULE — NO FAKE DATA
**NEVER use mock, placeholder, hardcoded, or invented data unless the user explicitly says "use mock data".**
- If an API returns nothing: show an empty state, not dummy values
- If a player has no stats: show "—", not made-up numbers
- If photos fail: show initials, not a wrong person's photo
- Wrong data is worse than no data — it destroys trust in the product
- This rule cannot be overridden by any other instruction or context

---

## Documentation Index

| Doc | What it covers |
|-----|---------------|
| `docs/ARCHITECTURE.md` | Full system architecture, data flow, route map, component tree |
| `docs/FEATURES.md` | Every page and feature on the site |
| `docs/DATA_SOURCES.md` | All APIs, env keys, caching TTLs, known quirks |
| `docs/AFL.md` | AFL analytics pipeline, roster, kitchen, player drawer, insights |
| `docs/NBA.md` | NBA data layer, kitchen, player analytics |
| `docs/SOCCER.md` | Soccer kitchen, Sofascore integration, tournamentId mapping |
| `docs/CS2.md` | CS2 esports, PandaScore API, limitations, future direction |
| `docs/KITCHEN_CONTEXT.md` | Kitchen engine deep-dive: reliability formula, slip configs, threshold logic |
| `docs/BETSLIP.md` | Betslip checker: Gemini Vision, upload flow, rating logic |
| `docs/PLAYER_PROFILES.md` | Player profile page: which sports, routes, what renders |

---

## Current Architecture (Three-Layer Model)

### 1. Roster Authority Layer
- **AFL**: Official AFL club sites are source of truth for current rosters, guernsey numbers, player roles
- **NBA/Soccer**: ESPN roster data
- **CS2**: PandaScore team/player data

### 2. Stats Layer
- **AFL**: ESPN API (`site.api.espn.com/apis/site/v2/sports/australian-football/afl`)
- **NBA**: ESPN API (schedule + boxscore traversal — direct athlete endpoints are broken)
- **Soccer**: Sofascore API (curl with TLS bypass required)
- **CS2**: PandaScore API

### 3. Intelligence Layer
Custom DegenHUB analytics:
- Reliability engine (`lib/sports/reliability/engine.ts`) — sport-agnostic
- AFL kitchen (`lib/sports/afl/kitchen.ts`) — bet slip generator
- NBA kitchen (`lib/sports/nba/kitchen.ts`) — bet slip generator
- Soccer kitchen (`lib/sports/soccer/kitchen.ts`) — bet slip generator
- Insights engine (`lib/sports/afl/insights.ts`) — matchup intelligence
- Predicted margin model (`lib/sports/afl/analytics.ts`) — composite 4-factor model
- Weather layer (`lib/sports/weather.ts`) — BOM for AU, Open-Meteo elsewhere

---

## Key Rules

### Data Integrity
- All reliability scoring flows through `lib/sports/reliability/engine.ts`. Never duplicate scoring logic.
- AFL roster truth: `lib/sports/afl/clubRoster.ts` + ESPN squad data
- AFL headshots: AFL CDN preferred (`lib/aflPlayerImage.ts`)

### Architecture Boundaries
- `lib/` contains all data-fetching and business logic — no React imports
- `components/` contains all UI — no direct API calls
- `app/` contains route handlers and page compositions
- API routes in `app/api/` are thin wrappers that call `lib/` functions

### Before Making Changes
1. Read `CLAUDE.md` (this file)
2. Read the relevant doc in `/docs/`
3. Audit the existing implementation
4. Do not touch unrelated systems
5. Keep changes tightly scoped

### After Making Changes
1. Explain what changed and why
2. List every modified file
3. Run `npm run build` to verify no TypeScript errors

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | For betslip | Google Gemini Flash (free tier) |
| `PANDASCORE_API_KEY` | For CS2 | PandaScore esports API |
| `THE_ODDS_API_KEY` | Optional | Real player prop odds for AFL/NBA kitchen |
| `SQUIGGLE_API_KEY` | Optional | AFL ladder/standings from Squiggle |

---

## Current Sports

| Sport | Status | Kitchen | Player Profile | Live |
|-------|--------|---------|---------------|------|
| AFL | Full | ✅ | ✅ Full analytics | ✅ |
| NBA | Full | ✅ | ✅ Generic game log | ✅ |
| Soccer | Partial | ✅ | ✅ Generic game log | ✅ |
| CS2 | Basic | ❌ | ❌ | ✅ Live listing |

---

## Planned Future Systems

- Betting intelligence and odds comparison
- Soccer shot maps and match visualization
- Momentum engines
- CS2 player analytics and match detail
- Live event rendering
