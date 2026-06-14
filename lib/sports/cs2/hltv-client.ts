/**
 * HLTV data client — reads from Vercel Blob cache.
 *
 * Data is uploaded by scripts/scrape-hltv.mjs running on the local mini PC.
 * The CS2 match page tries this before falling back to PandaScore analytics.
 *
 * Blob path: hltv-match/{pandascoreMatchId}.json
 * Cache TTL: 24 hours (data is refreshed manually before each major event)
 *
 * Returns null when:
 *   - BLOB_READ_WRITE_TOKEN not set
 *   - No cache entry exists for this match
 *   - Cache entry is older than 24 hours
 *   - Any fetch/parse error
 */

import type { MapWinrate, HeadToHead } from "@/lib/esports/analytics/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HLTVTeamData {
  hltvId:   number;
  name:     string;
  rank:     number | null;
  mapStats: MapWinrate[];
}

export interface HLTVMatchCache {
  matchId:    string;
  uploadedAt: number;
  homeTeam:   HLTVTeamData;
  awayTeam:   HLTVTeamData;
  h2h:        HeadToHead | null;
}

// ─── Cache TTL ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches HLTV match analytics from Vercel Blob cache.
 *
 * @param pandascoreMatchId  Canonical match ID, e.g. "cs2.match.12345"
 * @returns Cached HLTV data, or null if unavailable / expired
 */
export async function fetchHLTVMatchCache(
  pandascoreMatchId: string,
): Promise<HLTVMatchCache | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  const blobPath = `hltv-match/${pandascoreMatchId}.json`;

  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({
      prefix: blobPath,
      token:  process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (blobs.length === 0) return null;

    // Fetch the blob content
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[hltv-client] Blob fetch failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as HLTVMatchCache;

    // Check TTL
    if (Date.now() - data.uploadedAt > CACHE_TTL_MS) {
      console.info(`[hltv-client] Cache expired for ${pandascoreMatchId}`);
      return null;
    }

    console.info(
      `[hltv-client] Cache hit for ${pandascoreMatchId}` +
      ` (${data.homeTeam.name} vs ${data.awayTeam.name},` +
      ` uploaded ${Math.round((Date.now() - data.uploadedAt) / 60000)}m ago)`,
    );
    return data;
  } catch (err) {
    console.warn(
      "[hltv-client] Error reading cache:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
