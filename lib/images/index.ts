/**
 * Shared image resolution layer — sport-agnostic, deterministic fallback chains.
 *
 * AFL headshot chain:
 *   1. ChampID sync fast-path (hardcoded POC IDs, zero-cost)
 *   2. AFL Fantasy map (in-memory cache, populated after first async warm-up)
 *   3. ESPN CDN fallback
 *   4. Initials SVG data-URI (never null)
 */

import {
  resolveAFLCDNHeadshotSync,
} from "@/lib/sports/afl/champIDImages";
import {
  getAFLHeadshotSync,
} from "@/lib/sports/afl/fantasyMapper";

// ─── League logo map ──────────────────────────────────────────────────────────

const LEAGUE_LOGOS: Record<string, string> = {
  soccer:     "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  ucl:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  uel:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  laliga:     "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  aleague:    "https://a.espncdn.com/i/leaguelogos/soccer/500/1308.png",
  basketball: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  nfl:        "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  afl:        "https://a.espncdn.com/i/teamlogos/leagues/500/afl.png",
  cs2:        "",
  lol:        "",
};

// ─── ESPN sport path map (mirrors espn.ts) ────────────────────────────────────

const ESPN_SPORT_PATHS: Record<string, string> = {
  soccer:     "soccer/eng.1",
  ucl:        "soccer/eng.1",
  uel:        "soccer/eng.1",
  laliga:     "soccer/esp.1",
  bundesliga: "soccer/ger.1",
  aleague:    "soccer/aus.1",
  basketball: "basketball/nba",
  nfl:        "football/nfl",
  afl:        "australian-football/afl",
};

// ─── Initials fallback ────────────────────────────────────────────────────────

function initialsDataUri(name: string): string {
  const parts   = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <rect width="80" height="80" rx="40" fill="#1F2937"/>
  <text x="40" y="46" font-family="system-ui,sans-serif" font-size="24" font-weight="600" fill="#9CA3AF" text-anchor="middle">${initials}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves a player headshot URL.
 *
 * For AFL:
 *   1. ChampID sync fast-path (3 hardcoded POC players)
 *   2. AFL Fantasy in-memory map (warm after first page load)
 *   3. ESPN CDN (reliable fallback for all ESPN-tracked players)
 *   4. Initials SVG (always non-null, client-renderable)
 *
 * For other sports: ESPN CDN → initials.
 */
export function resolvePlayerHeadshot(params: {
  sport: string;
  playerId: string;
  playerName?: string;
}): string {
  const { sport, playerId, playerName } = params;

  if (sport === "afl" && playerName) {
    // Step 1: ChampID hardcoded fast-path
    const cdnUrl = resolveAFLCDNHeadshotSync(playerName);
    if (cdnUrl) return cdnUrl;

    // Step 2: AFL Fantasy in-memory map (sync, populated after warm-up)
    const fantasyUrl = getAFLHeadshotSync(playerId, playerName);
    // getAFLHeadshotSync already falls through to ESPN if cache is cold
    if (fantasyUrl) return fantasyUrl;
  }

  // Step 3: ESPN CDN (all ESPN-tracked sports)
  const espnPath = ESPN_SPORT_PATHS[sport];
  if (espnPath && playerId) {
    const [sportKey] = espnPath.split("/");
    return `https://a.espncdn.com/i/headshots/${sportKey}/players/full/${playerId}.png`;
  }

  // Step 4: Initials SVG
  return initialsDataUri(playerName ?? playerId ?? "?");
}

/**
 * Resolves a team logo URL.
 * Returns ESPN CDN URL for all ESPN-tracked sports.
 * Returns empty string for sports not yet in ESPN (cs2, lol).
 */
export function resolveTeamLogo(params: {
  sport: string;
  espnTeamId: string;
}): string {
  const { sport, espnTeamId } = params;
  const espnPath = ESPN_SPORT_PATHS[sport];
  if (!espnPath || !espnTeamId) return "";

  const [sportKey, leagueKey] = espnPath.split("/");
  return `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${espnTeamId}.png`;
}

/**
 * Resolves a league logo URL.
 * Returns the configured logo for known sports, empty string for unknown.
 */
export function resolveLeagueLogo(sport: string): string {
  return LEAGUE_LOGOS[sport] ?? "";
}
