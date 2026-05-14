/**
 * File-based persistent cache for NBA player game logs.
 *
 * Strategy:
 *   < FRESH_MS  (30 min): return cached, no network call
 *   FRESH_MS – TTL_MS (4 h): incremental check — fetch current season schedule
 *     and only pull new game summaries since lastGameDate
 *   > TTL_MS: full refetch of all seasons
 *
 * Cache location: data/nba/players/{athleteId}.json
 */

import { promises as fs } from "fs";
import path from "path";
import type { NBAPlayerGame } from "./types";

interface CacheEntry {
  version:         number;
  cachedAt:        string;     // ISO timestamp
  teamId:          string;
  lastGameDate:    string;     // date of most recent game (YYYY-MM-DD), "" if empty
  games:           NBAPlayerGame[];
  seasonsIncluded: number[];
}

export const CACHE_VERSION = 3;
export const FRESH_MS      = 30 * 60 * 1000;   // 30 min — return as-is
export const TTL_MS        = 4  * 60 * 60 * 1000;  // 4 h — full refetch

const CACHE_DIR = path.join(process.cwd(), "data", "nba", "players");

function cachePath(athleteId: string): string {
  return path.join(CACHE_DIR, `${athleteId}.json`);
}

export interface ReadCacheResult {
  entry:   CacheEntry;
  ageMs:   number;
  isFresh: boolean;   // < FRESH_MS
  isStale: boolean;   // > TTL_MS
}

export async function readPlayerCache(athleteId: string): Promise<ReadCacheResult | null> {
  try {
    const raw   = await fs.readFile(cachePath(athleteId), "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.version !== CACHE_VERSION) return null;
    const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
    return {
      entry,
      ageMs,
      isFresh: ageMs < FRESH_MS,
      isStale: ageMs > TTL_MS,
    };
  } catch {
    return null;
  }
}

export async function writePlayerCache(
  athleteId:       string,
  teamId:          string,
  games:           NBAPlayerGame[],
  seasonsIncluded: number[]
): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = {
      version:      CACHE_VERSION,
      cachedAt:     new Date().toISOString(),
      teamId,
      lastGameDate: games[0]?.date ?? "",   // games are newest-first
      games,
      seasonsIncluded,
    };
    await fs.writeFile(cachePath(athleteId), JSON.stringify(entry), "utf-8");
  } catch {
    // Non-fatal — next request will refetch
  }
}
