/**
 * AFL active-player name → Champion Data ID mapping + squad membership index.
 *
 * Source: fantasy.afl.com.au/data/afl/players.json — 808 current-season players.
 * AFL Fantasy player IDs are identical to Champion Data numeric IDs (verified).
 * Portrait CDN: s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/
 *
 * This file is the single source of truth for:
 *   - Which players are active this season (Fantasy filters out retired/delisted)
 *   - Which team each player belongs to (squad_id, authoritative)
 *   - Portrait URL construction (Champion Data ID = Fantasy ID)
 *
 * Caching (two layers, both 24 h):
 *   Layer 1 — Next.js data cache: `next: { revalidate: 86400 }`, persists across
 *             serverless cold starts via Vercel shared data cache.
 *   Layer 2 — module-level in-memory Maps with 24 h TTL, zero-cost O(1) lookups
 *             within the same server process lifetime.
 * Cold-start cost: one network request (~808 player records, <50 KB).
 */

const FANTASY_PLAYERS_URL = "https://fantasy.afl.com.au/data/afl/players.json";

// AFL CDN portrait URL. "{year}014" — year is current AFL season, "014" is a fixed
// content-type identifier confirmed in 2025 and 2026. Update if AFL changes the suffix.
function aflCDNPortraitUrl(champNumericId: number): string {
  return `https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/${new Date().getFullYear()}014/${champNumericId}.png`;
}

// ─── Fantasy API types ────────────────────────────────────────────────────────

interface FantasyPlayer {
  id:                 number;   // Champion Data numeric ID (identical to portrait ID)
  first_name:         string;
  last_name:          string;
  squad_id:           number;   // Team membership — authoritative for current season
  status:             string;   // "playing" | "injured" | "not-playing" | "medical_sub"
  positions?:         number[]; // 1=DEF 2=MID 3=RUC 4=FWD
  original_positions?: number[];
}

/** Minimal exported shape for consumers that need squad roster data. */
export interface AFLFantasySquadPlayer {
  champId:    number;
  firstName:  string;
  lastName:   string;
  squadId:    number;
  status:     string;     // "playing" | "injured" | "not-playing" | "medical_sub"
  positions:  number[];   // AFL Fantasy position codes: 1=DEF 2=MID 3=RUC 4=FWD
}

// ─── ESPN team ID → Fantasy squad_id mapping ─────────────────────────────────
// Verified May 2026 via fantasy.afl.com.au/data/afl/squads.json cross-referenced
// with site.api.espn.com/apis/site/v2/sports/australian-football/afl/teams.
// Update if ESPN or AFL Fantasy renumbers teams.

export const ESPN_TO_AFL_SQUAD: Record<string, number> = {
  "1":  60,   // Fremantle
  "2":  90,   // Melbourne
  "3":  150,  // West Coast Eagles
  "4":  160,  // Sydney Swans
  "5":  100,  // North Melbourne
  "6":  140,  // Western Bulldogs
  "7":  110,  // Port Adelaide
  "8":  1010, // GWS GIANTS
  "9":  30,   // Carlton
  "10": 1000, // Gold Coast SUNS
  "11": 20,   // Brisbane Lions
  "12": 120,  // Richmond
  "13": 80,   // Hawthorn
  "14": 70,   // Geelong Cats
  "15": 10,   // Adelaide Crows
  "16": 50,   // Essendon
  "17": 40,   // Collingwood
  "18": 130,  // St Kilda
};

// ─── Normalization ────────────────────────────────────────────────────────────

// Tokens to strip regardless of position (suffixes, generational markers).
const SUFFIX_TOKENS = new Set(["jr", "sr", "jnr", "snr", "ii", "iii", "iv"]);

/**
 * Normalizes a player name for reliable matching across data sources.
 * - Strips suffixes (Jr, Jnr, Sr, II, III, IV)
 * - Strips single-character interior tokens (middle initials like "J." in "Tom J. Lynch")
 * - Always keeps first and last tokens (unless they are suffixes)
 */
export function normalizeAFLName(name: string): string {
  if (!name) return "";
  const parts = name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "";

  return parts
    .filter((part, i, arr) => {
      if (SUFFIX_TOKENS.has(part)) return false;
      if (i > 0 && i < arr.length - 1 && part.length === 1) return false;
      return true;
    })
    .join("");
}

// ─── In-memory caches ─────────────────────────────────────────────────────────

let playerMapCache: Map<string, number> | null = null;           // norm name → champId
let squadIndexCache: Map<number, AFLFantasySquadPlayer[]> | null = null; // squadId → players
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// ─── Core fetch ───────────────────────────────────────────────────────────────

/**
 * Fetches and caches the AFL Fantasy player data.
 * Populates both the name→champId map and the squadId→players index in one fetch.
 */
export async function getAFLFantasyMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (playerMapCache && squadIndexCache && now - lastFetchTime < CACHE_TTL) {
    return playerMapCache;
  }

  try {
    const res = await fetch(FANTASY_PLAYERS_URL, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });

    if (!res.ok) throw new Error(`AFL Fantasy API ${res.status}`);

    const players: FantasyPlayer[] = await res.json();
    const nameMap   = new Map<string, number>();
    const squadIdx  = new Map<number, AFLFantasySquadPlayer[]>();

    for (const p of players) {
      const fullName   = `${p.first_name} ${p.last_name}`;
      const normalized = normalizeAFLName(fullName);
      if (normalized) nameMap.set(normalized, p.id);

      if (p.squad_id) {
        if (!squadIdx.has(p.squad_id)) squadIdx.set(p.squad_id, []);
        squadIdx.get(p.squad_id)!.push({
          champId:   p.id,
          firstName: p.first_name,
          lastName:  p.last_name,
          squadId:   p.squad_id,
          status:    p.status ?? "playing",
          positions: Array.isArray(p.positions) ? p.positions : [],
        });
      }
    }

    playerMapCache  = nameMap;
    squadIndexCache = squadIdx;
    lastFetchTime   = now;

    const teamCount = squadIdx.size;
    console.info(`[SportsPulse] AFL Fantasy map ready: ${nameMap.size} active players, ${teamCount} squads`);
    return nameMap;
  } catch (err) {
    console.error("[SportsPulse] Error fetching AFL Fantasy map", err);
    return playerMapCache ?? new Map();
  }
}

/**
 * Returns the current Fantasy squad for a given squad_id.
 * Only works after getAFLFantasyMap() has been called (sync — no await).
 */
export function getAFLSquadSync(squadId: number): AFLFantasySquadPlayer[] {
  return squadIndexCache?.get(squadId) ?? [];
}

// ─── Portrait resolution ──────────────────────────────────────────────────────

/**
 * Resolves an official AFL CDN portrait URL for a given player name.
 * Coverage: ~808 active-season AFL players. Returns null if not found.
 */
export async function resolveAFLFantasyHeadshot(playerName: string): Promise<string | null> {
  const map     = await getAFLFantasyMap();
  const normalized = normalizeAFLName(playerName);
  const champId = map.get(normalized);

  if (champId) {
    console.debug(`[SportsPulse] AFL CDN portrait resolved: ${playerName} -> ${champId}`);
    return aflCDNPortraitUrl(champId);
  }

  console.debug(`[SportsPulse] AFL CDN portrait miss: ${playerName} (normalized: "${normalized}")`);
  return null;
}

/**
 * Synchronous portrait URL resolver.
 * Only works after getAFLFantasyMap() has populated the in-memory cache.
 * Falls back to ESPN CDN pattern if cache is cold or player not found.
 */
export function getAFLHeadshotSync(playerId: string, playerName?: string): string {
  if (playerName && playerMapCache) {
    const champId = playerMapCache.get(normalizeAFLName(playerName));
    if (champId) return aflCDNPortraitUrl(champId);
  }
  return `https://a.espncdn.com/i/headshots/australian-football/players/full/${playerId}.png`;
}
