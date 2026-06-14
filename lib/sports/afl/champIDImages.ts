/**
 * AFL CDN portrait URL helpers + POC hardcoded fast-path.
 *
 * Production coverage comes from fantasyMapper.ts (resolveAFLFantasyHeadshot),
 * which maps ~808 active-season players via fantasy.afl.com.au/data/afl/players.json.
 * AFL Fantasy IDs == Champion Data numeric IDs (verified for all test players).
 *
 * This file provides:
 *   - getAFLCDNPortraitUrl(): shared URL constructor
 *   - resolveAFLCDNHeadshotSync(): instant sync fast-path for 3 hardcoded POC players
 *     (avoids Map.get() for known high-profile players before async map is warm)
 *
 * CDN: s.afl.com.au — hotlinking permitted, Akamai, 2-day cache, no CORS on <img>.
 */

const AFL_CDN_BASE =
  "https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL";

function seasonSegment(): string {
  return `${new Date().getFullYear()}014`;
}

export function getAFLCDNPortraitUrl(champNumericId: string): string {
  return `${AFL_CDN_BASE}/${seasonSegment()}/${champNumericId}.png`;
}

// ── POC: hardcoded Champion Data numeric IDs for 3 confirmed players ──────────
// Verified via AFL API: providerId "CD_I{numericId}", images return HTTP 200.
// Expand with API-based lookup (aflapi.afl.com.au/afl/v2/players) in next phase.
const POC_CHAMP_IDS: Record<string, string> = {
  "nick daicos":        "1023261", // Collingwood
  "marcus bontempelli": "297373",  // Western Bulldogs
  "noah anderson":      "1009199", // Gold Coast Suns
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns an AFL CDN portrait URL if the player is in the hardcoded POC map.
 * Returns null if not found — caller should fall back to next strategy.
 */
export function resolveAFLCDNHeadshotSync(playerName: string): string | null {
  const id = POC_CHAMP_IDS[normalize(playerName)];
  return id ? getAFLCDNPortraitUrl(id) : null;
}
