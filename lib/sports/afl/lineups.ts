/**
 * AFL Lineup Fetcher — uses the AFL CFS API for confirmed INS/OUTS.
 *
 * Authentication:
 *   POST https://api.afl.com.au/cfs/afl/WMCTok  (public endpoint — no credentials required)
 *   Returns a short-lived session token used in `x-media-mis-token` header.
 *
 * Lineup data:
 *   GET https://api.afl.com.au/cfs/afl/matchRosters/round/{roundId}?minimal=true
 *   Returns all matches for a round, each with `matchRoster.homeTeam.outs` / `awayTeam.outs`.
 *
 * Round ID format:  CD_R{year}014{round padded to 2 digits}
 * Team ID format:   CD_T{AFL Fantasy squadId}  (identical to ESPN_TO_AFL_SQUAD values)
 *
 * Falls back to AFL Fantasy status data if the CFS API is unavailable.
 *
 * Returns a pair of excluded player name sets (lowercase), or null on failure.
 * The kitchen treats null as "no lineup data — fall back to ESPN injuries only".
 */

import {
  getAFLFantasyMap,
  getAFLSquadSync,
  ESPN_TO_AFL_SQUAD,
} from "./fantasyMapper";

// ─── CFS API constants ─────────────────────────────────────────────────────────

const CFS_BASE      = "https://api.afl.com.au/cfs/afl";
const CFS_ORIGIN    = "https://www.afl.com.au";
const CFS_UA        = "SportsPulse/1.0 personal";

// ─── WMCTok cache (module-level, survives warm serverless invocations) ─────────

let cachedToken: string | null   = null;
let tokenExpiryMs                = 0;
const TOKEN_TTL_MS               = 55 * 60 * 1000; // 55 minutes

async function getWMCToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiryMs) return cachedToken;

  try {
    const res = await fetch(`${CFS_BASE}/WMCTok`, {
      method: "POST",
      headers: { "Origin": CFS_ORIGIN, "User-Agent": CFS_UA },
      // Short revalidation — token is session-scoped
      next: { revalidate: 3000 },
    });
    if (!res.ok) {
      console.warn("[lineups] WMCTok fetch failed:", res.status);
      return null;
    }
    const data = await res.json();
    cachedToken    = data.token as string;
    tokenExpiryMs  = now + TOKEN_TTL_MS;
    console.info("[lineups] WMCTok refreshed");
    return cachedToken;
  } catch (err) {
    console.warn("[lineups] WMCTok error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Round roster cache ────────────────────────────────────────────────────────

const roundCache = new Map<string, { entries: any[]; expiryMs: number }>();
const ROUND_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchRoundRosters(year: number, roundNumber: number): Promise<any[] | null> {
  const roundId  = `CD_R${year}014${String(roundNumber).padStart(2, "0")}`;
  const cached   = roundCache.get(roundId);
  if (cached && Date.now() < cached.expiryMs) return cached.entries;

  const token = await getWMCToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `${CFS_BASE}/matchRosters/round/${roundId}?minimal=true`,
      {
        headers: {
          "x-media-mis-token": token,
          "Origin":            CFS_ORIGIN,
          "User-Agent":        CFS_UA,
        },
        next: { revalidate: 1800 },
      },
    );
    if (!res.ok) {
      console.warn("[lineups] matchRosters/round fetch failed:", res.status, roundId);
      return null;
    }
    const entries: any[] = await res.json();
    if (!Array.isArray(entries)) return null;

    roundCache.set(roundId, { entries, expiryMs: Date.now() + ROUND_TTL_MS });
    console.info(`[lineups] CFS round ${roundId}: ${entries.length} matches loaded`);
    return entries;
  } catch (err) {
    console.warn("[lineups] round roster error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Name extraction ──────────────────────────────────────────────────────────

function extractOuts(team: any): Set<string> {
  const excluded = new Set<string>();
  for (const out of team?.outs ?? []) {
    const name = out?.player?.playerName;
    if (name?.givenName && name?.surname) {
      excluded.add(`${name.givenName} ${name.surname}`.toLowerCase());
    }
  }
  return excluded;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the confirmed INS/OUTS for an AFL match via the AFL CFS API.
 *
 * @param year        AFL season year (e.g. 2026)
 * @param roundNumber AFL round number (e.g. 11)
 * @param homeEspnId  ESPN team ID for the home team (e.g. "8" for GWS)
 * @param awayEspnId  ESPN team ID for the away team (e.g. "11" for Brisbane Lions)
 *
 * Returns { home, away } sets of excluded player names (lowercase), or null on failure.
 * Falls back to AFL Fantasy status data if CFS API is unavailable.
 */
export async function fetchAFLMatchExcluded(
  year:        number,
  roundNumber: number,
  homeEspnId:  string,
  awayEspnId:  string,
): Promise<{ home: Set<string>; away: Set<string> } | null> {
  const homeSquadId = ESPN_TO_AFL_SQUAD[homeEspnId];
  const awaySquadId = ESPN_TO_AFL_SQUAD[awayEspnId];

  if (!homeSquadId || !awaySquadId) {
    console.info(`[lineups] Unknown ESPN team ID(s): home=${homeEspnId}, away=${awayEspnId}`);
    return null;
  }

  // ── Try CFS API first ──
  try {
    const entries = await fetchRoundRosters(year, roundNumber);
    if (entries) {
      const homeCDId = `CD_T${homeSquadId}`;
      const awayCDId = `CD_T${awaySquadId}`;

      const matchEntry = entries.find((m: any) => {
        const htid = m?.match?.homeTeamId;
        const atid = m?.match?.awayTeamId;
        return htid === homeCDId && atid === awayCDId;
      });

      if (matchEntry) {
        const homeOuts = extractOuts(matchEntry?.matchRoster?.homeTeam);
        const awayOuts = extractOuts(matchEntry?.matchRoster?.awayTeam);

        const status = matchEntry?.matchRoster?.status ?? "?";
        const totalOuts = homeOuts.size + awayOuts.size;
        console.info(
          `[lineups] CFS ${homeCDId} vs ${awayCDId} (${status}):` +
          ` home ${homeOuts.size} out, away ${awayOuts.size} out` +
          (totalOuts > 0
            ? ` — home: [${Array.from(homeOuts).join(", ")}] | away: [${Array.from(awayOuts).join(", ")}]`
            : ""),
        );
        return { home: homeOuts, away: awayOuts };
      }

      console.info(`[lineups] CFS: no match found for ${homeCDId} vs ${awayCDId} in year=${year} round=${roundNumber}`);
    }
  } catch (err) {
    console.warn("[lineups] CFS lookup failed:", err instanceof Error ? err.message : String(err));
  }

  // ── Fallback: AFL Fantasy status ──
  console.info("[lineups] Falling back to AFL Fantasy status data");
  return fetchAFLExcludedFromFantasy(homeEspnId, awayEspnId);
}

// ─── Fantasy fallback ─────────────────────────────────────────────────────────

/**
 * AFL Fantasy status-based exclusion (fallback when CFS API unavailable).
 *
 * Fantasy status values:
 *   "playing"     → selected for this round (NOT excluded)
 *   "injured"     → confirmed injury (excluded)
 *   "medical_sub" → medical substitute (excluded from normal selection)
 *   "not-playing" → not selected this round (excluded — includes bench/omitted)
 */
async function fetchAFLExcludedFromFantasy(
  homeEspnId: string,
  awayEspnId: string,
): Promise<{ home: Set<string>; away: Set<string> } | null> {
  try {
    await getAFLFantasyMap();

    const home = fetchFantasyTeamExcluded(homeEspnId);
    const away = fetchFantasyTeamExcluded(awayEspnId);
    if (!home && !away) return null;

    return {
      home: home ?? new Set<string>(),
      away: away ?? new Set<string>(),
    };
  } catch (err) {
    console.warn("[lineups] Fantasy fallback failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Regex for AFL Fantasy statuses that mean "not playing this round"
// "not-playing" covers non-selected squad members + omitted players
// "injured" + "medical_sub" cover confirmed injuries
const FANTASY_OUT_RE = /^(injured|not-playing|medical_sub)$/i;

function fetchFantasyTeamExcluded(espnId: string): Set<string> | null {
  const squadId = ESPN_TO_AFL_SQUAD[espnId];
  if (!squadId) return null;

  const players = getAFLSquadSync(squadId);
  if (players.length === 0) return null;

  const excluded = new Set<string>();
  for (const p of players) {
    if (!FANTASY_OUT_RE.test(p.status)) continue;
    excluded.add(`${p.firstName} ${p.lastName}`.toLowerCase());
  }

  if (excluded.size > 0) {
    console.info(`[lineups] Fantasy ${espnId} (squad ${squadId}): ${excluded.size} excluded`);
  }
  return excluded;
}

// ─── Legacy per-team export (used by cron/save-slips) ────────────────────────

/**
 * @deprecated Use fetchAFLMatchExcluded() which gets both teams in one call.
 * Kept for backwards compatibility with the cron save-slips route.
 *
 * Returns a Set of excluded player names (lowercase) for a single ESPN team ID,
 * based solely on AFL Fantasy status data (no CFS API — no round context available).
 */
export async function fetchAFLExcludedPlayers(
  espnTeamId: string,
): Promise<Set<string> | null> {
  try {
    await getAFLFantasyMap();
    return fetchFantasyTeamExcluded(espnTeamId);
  } catch (err) {
    console.warn("[lineups] fetchAFLExcludedPlayers error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
