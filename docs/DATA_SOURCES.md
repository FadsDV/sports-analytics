# DegenHUB — Data Sources

> All APIs, env keys, caching TTLs, known quirks, and constraints.
> Read this before touching any data-fetching code.

---

## ESPN API (AFL + NBA + Soccer)

**Base URL**: `https://site.api.espn.com/apis/site/v2/sports/`

No API key required. Public API.

### Sport path segments

| Sport | ESPN path |
|-------|-----------|
| AFL | `australian-football/afl` |
| NBA | `basketball/nba` |
| Soccer (general) | `soccer/all` |
| A-League | `soccer/aus.1` |
| UCL | `soccer/uefa.champions` |
| UEL | `soccer/uefa.europa` |
| La Liga | `soccer/esp.1` |
| Bundesliga | `soccer/ger.1` |

These paths are defined in `lib/sports/espn.ts` as `ESPN_PATHS`.

### Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `/{sport}/scoreboard` | Game list + live scores |
| `/{sport}/summary?event={id}` | Full game detail (boxscore, roster, play-by-play) |
| `/{sport}/teams/{teamId}/schedule` | Team schedule (used for NBA player history) |
| `/{sport}/athletes/{id}` | Athlete profile — **broken for NBA** (see quirks) |
| `/{sport}/teams` | All teams |

### ESPN Quirks

**NBA athlete endpoint broken**: `GET /basketball/nba/athletes/{id}` returns stale/broken data.
- **Fix**: Traverse team schedule → boxscore summaries to build game log manually.
- `lib/sports/nba/players/history.ts` does full-season traversal, month-grouped, with incremental cache.

**Score format inconsistency**: In boxscore summaries, `score` is sometimes a string, sometimes an object `{ value: number }`.
- Always use `lib/sports/espn.ts` score normalizer.

**AFL game IDs**: ESPN AFL game IDs are numeric. The app prefixes them `afl-{id}` internally.

---

## Sofascore API (Soccer)

**Used for**: Soccer player stats — per-match stats, heatmaps, ratings.

**Base URL**: `https://api.sofascore.com/api/v1/`

No API key required, but:
- **TLS fingerprinting blocks standard fetch**. Must use `curl` with `--insecure` or appropriate TLS bypass.
- Implementation: `lib/sports/sofascore.ts` uses `execSync('curl ...')` to bypass.

### Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `/event/{matchId}/lineups` | Player lineups with ratings |
| `/player/{id}/statistics/season` | Season stats |
| `/player/{id}/recent-matches` | Recent matches |
| `/team/{id}/players` | Team roster |

### Sofascore player IDs

Sofascore uses its own player IDs, not ESPN IDs. The soccer player endpoint at `/api/soccer/player/[playerId]` accepts Sofascore player IDs.

---

## Squiggle API (AFL Standings)

**Used for**: AFL ladder positions, team win percentages, ELO ratings.

**Base URL**: `https://api.squiggle.com.au/`

No API key required (free public API, but see rate limits — be respectful).

**Implementation**: `lib/sports/squiggle.ts`

Key call: `GET /?q=standings;year={year}` → returns all teams with points, wins, losses, percentage.

Used in: AFL predicted margin model (ladder position is 30% weight).

---

## AFL CFS API (Lineup Data)

**Used for**: Confirmed match-day INS/OUTS for AFL games.

**Base URL**: `https://api.afl.com.au/cfs/afl`

**Auth**: Public endpoint — no API key required.
Token from `POST /cfs/afl/WMCTok` (cached 55 min module-level).

### Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /WMCTok` | Get session token (public, no credentials) |
| `GET /matchRosters/round/{roundId}?minimal=true` | All match rosters for a round |

**Round ID format**: `CD_R{year}014{round:02d}` — e.g., `CD_R202601411` for Round 11 2026.
**Team ID format**: `CD_T{squadId}` — `squadId = ESPN_TO_AFL_SQUAD[espnId]` from `lib/sports/afl/fantasyMapper.ts`.

**Implementation**: `lib/sports/afl/lineups.ts` → `fetchAFLMatchExcluded(year, roundNumber, homeEspnId, awayEspnId)`

Falls back to AFL Fantasy status data if CFS API fails. Fantasy data may be stale after Fantasy locks (before the official AFL 90-min deadline).

---

## Vercel Blob Odds Cache (AFL Kitchen)

**Used for**: Storing real bookmaker player prop prices from the local home-PC scraper.

**Blob path**: `odds-cache/{gameId}.json`
**Freshness**: event-aware when scraper provides `kickoffAt` / `expiresAt`; legacy fallback TTL is 4 hours

**Implementation**: `lib/sports/afl/oddsCache.ts`

### Mini-PC worker schedule

The local Bet365 worker is intended to attempt captures:
- 24 hours before kickoff
- 1 hour before kickoff
- then again 1 hour later only when odds/stats were not yet available

Local worker state and raw captures are stored under `data/local/bet365-worker/` and cleaned up 10 hours after kickoff.

### Write endpoint
```
POST /api/odds/upload
Authorization: Bearer {ODDS_UPLOAD_SECRET}
```
Body: `{ gameId, bookie, timestamp, kickoffAt?, expiresAt?, legs: [{ player, stat, line, price }] }`
Supported bookies: `bet365`, `dabble`, `sportsbet`, `ladbrokes`

### Read priority
The kitchen checks Blob FIRST before calling The Odds API. If scraper data exists and is still inside its event window, The Odds API is skipped entirely (preserving quota). Older payloads without event metadata fall back to a 4-hour freshness check.

### Debug endpoint
```
GET /api/debug/odds?home=GWS+Giants&away=Brisbane+Lions
Authorization: Bearer {CRON_SECRET}
```
Returns: Odds API event list, available markets, player names + normalized forms, Blob cache status.

---

## The Odds API (AFL + NBA Player Props)

**Used for**: Real bookmaker player prop lines and prices for the Kitchen.

**Base URL**: `https://api.the-odds-api.com/v4/`

**Auth**: `THE_ODDS_API_KEY` environment variable (optional — Kitchen works without it using derived thresholds).

**Note**: AFL player props (`player_disposals`, `player_goals_scored_over`, etc.) may not be covered on the free tier. Even when data returns, player names may not exactly match ESPN names — use `normalizeAFLName()` on both sides.

### Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `/sports/{sport}/events` | Event list (to find event ID by team name) |
| `/sports/{sport}/events/{id}/odds` | Player prop odds for a specific game |

### AFL prop markets tracked

| Market key | Stat |
|------------|------|
| `player_disposals` | D |
| `player_goals_scored_over` | G |
| `player_marks_over` | M |
| `player_tackles_over` | T |

### Important: Live game behaviour

During live games, The Odds API **suspends player props** (books pull markets when game is in progress). This means `propOdds` Map will be empty during live AFL games.

**Kitchen fallback**: When no prop odds are available, `buildValueLegs` in `lib/sports/afl/kitchen.ts` derives a natural threshold using `findBestThreshold(vals, avg, stat, 0.65, 0.85, 0.65, 0.82)`. These value picks show edge analysis but no odds price.

---

## Google Gemini Flash (Betslip Checker)

**Used for**: OCR + analysis of uploaded betslip images.

**Model**: `gemini-2.5-flash` (free tier as of 2026)

**Auth**: `GEMINI_API_KEY` environment variable

**Free tier limits**: 15 RPM / 1M tokens per month (no credit card required)

**Get key**: https://aistudio.google.com/app/apikey

**Implementation**: `app/api/betslip/analyze/route.ts`

Accepts: `multipart/form-data` with `image` field (JPEG/PNG/WebP/GIF)

Returns: Structured JSON verdict with per-leg ratings and overall slip assessment.

---

## PandaScore API (CS2)

**Used for**: CS2 esports match data — live, upcoming, results, teams, players.

**Base URL**: `https://api.pandascore.co`

**Auth**: `PANDASCORE_API_KEY` environment variable

**Implementation**: `lib/sports/cs2/client.ts` + `lib/providers/esports/pandascore/`

### Free tier restrictions

- Individual match endpoints (`/csgo/matches/{id}`) return **403** on free plan
- All data must come from list endpoints: `running`, `upcoming`, `past`
- `fetchCS2Match(id)` works around this by searching the cached list results

### Cache TTLs

| Endpoint | TTL |
|----------|-----|
| Live matches | 30s |
| Upcoming | 5 min |
| Past results | 30 min |
| Team data | 4 hr |
| Team match history | 2 hr |

---

## AFL Club Sites (Roster Authority)

**Used for**: Authoritative AFL roster data — current squad, guernsey numbers, player roles.

ESPN roster data can lag. The official club websites are the ground truth.

**Implementation**: `lib/sports/afl/clubRoster.ts` — static/cached authoritative roster data.

---

## AFL CDN (Player Headshots)

**Used for**: Official AFL player headshot images.

**Implementation**: `lib/aflPlayerImage.ts` + `lib/sports/afl/champIDImages.ts`

Resolution chain:
1. Champion Data CDN (via `champIDImages.ts` mapping)
2. AFL official CDN fallback
3. ESPN athlete thumbnail fallback

---

## BOM (Weather — Australian locations)

**Used for**: Weather conditions for AFL venues.

**Bureau of Meteorology** — Australian government weather API.

**Fallback**: Open-Meteo API for non-Australian locations.

**Implementation**: `lib/sports/weather.ts`

Returns: temperature, wind speed, wind direction, precipitation, and a computed `condition` string (e.g. "Clear", "Windy", "Heavy Rain", "Indoor").

Weather is shown in the AFL game pre-match view. Hidden at 2xl breakpoint in the right column (`2xl:hidden`) to keep the column clean on very wide screens.

---

## Environment Variables Summary

```env
# Required for betslip checker
GEMINI_API_KEY=...

# Required for CS2 data
PANDASCORE_API_KEY=...

# Optional — Kitchen shows derived thresholds without it
THE_ODDS_API_KEY=...

# Optional — Squiggle standings for AFL model
# (Squiggle is public, no key needed currently)

# Required for Vercel Blob (slip storage + odds cache)
BLOB_READ_WRITE_TOKEN=...

# Required for /api/odds/upload (local scraper → Blob)
# ALWAYS required — endpoint rejects all requests without it
ODDS_UPLOAD_SECRET=...

# Optional — protects /api/cron/* and /api/debug/odds routes
# If not set, these routes are open (dev mode)
CRON_SECRET=...
```

No keys needed for: ESPN, Sofascore, Squiggle, AFL CDN, AFL CFS API.
