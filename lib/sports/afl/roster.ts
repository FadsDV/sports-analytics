/**
 * AFL Roster Provider — delegates to official club website scraper.
 *
 * Source of truth: official AFL club pages (clubRoster.ts).
 * ESPN is fetched ONLY to obtain ESPN athlete IDs for the analytics pipeline.
 * ESPN never determines who is on the team. AFL Fantasy is not consulted at all.
 */

import { fetchClubRoster } from "./clubRoster";
import { normalizeAFLName } from "./fantasyMapper";
import { getAFLCDNPortraitUrl } from "./champIDImages";
import type { ESPNPlayer } from "../espnPlayers";

const ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATH = "australian-football/afl";

// ── ESPN ID enrichment ────────────────────────────────────────────────────────

/**
 * Fetches ESPN's team roster solely to extract normalizedName → ESPN ID mappings.
 * This is never used to determine squad membership — only to attach ESPN IDs
 * to club-scraped players so the analytics API can be called.
 */
async function buildESPNIdMap(espnTeamId: string): Promise<Map<string, string>> {
  const url = `${ESPN_BASE}/${SPORT_PATH}/teams/${espnTeamId}?enable=roster`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return new Map();

    const data     = await res.json();
    const athletes: any[] = data.team?.athletes ?? [];
    const map      = new Map<string, string>();

    for (const a of athletes) {
      if (!a.id || !a.displayName) continue;
      const norm = normalizeAFLName(String(a.displayName));
      if (norm && !map.has(norm)) map.set(norm, String(a.id));
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns the active roster for an AFL team from the official club website.
 * ESPN athlete IDs are layered on for analytics — they never affect who appears.
 */
export async function fetchAFLTeamRoster(espnTeamId: string): Promise<ESPNPlayer[]> {
  // Club scrape and ESPN ID fetch are independent — run in parallel.
  const [clubPlayers, espnIdMap] = await Promise.all([
    fetchClubRoster(espnTeamId),
    buildESPNIdMap(espnTeamId),
  ]);

  const players: ESPNPlayer[] = clubPlayers.map(p => ({
    id:           espnIdMap.get(p.normName) ?? "",
    displayName:  p.displayName,
    jersey:       p.jersey || undefined,
    position:     p.positionAbbr,
    positionFull: p.position,
    seasonStats:  {},
    headshot:     p.champId ? getAFLCDNPortraitUrl(p.champId) : "",
  }));

  const matched = players.filter(p => p.id).length;
  const noId    = players.filter(p => !p.id).map(p => p.displayName);

  console.info(
    `[SportsPulse] AFL roster — source:club-official | ESPN-team:${espnTeamId} | ` +
    `total:${players.length} ESPN-ID-matched:${matched} no-ESPN-ID:${noId.length}`
  );
  if (noId.length > 0) {
    console.warn(
      `[SportsPulse] AFL roster no ESPN ID (analytics unavailable): ${noId.join(", ")}`
    );
  }

  return players;
}
