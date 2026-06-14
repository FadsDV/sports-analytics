/**
 * Static soccer data reader — reads pre-collected JSON files from GitHub.
 *
 * The local collect-soccer script (scripts/collect-soccer.ts) runs on a
 * residential machine, fetches Sofascore freely, writes JSON files to
 * data/soccer/, and pushes to GitHub. Vercel reads these via raw GitHub URLs
 * — no Sofascore API calls from Vercel at all.
 *
 * NO FAKE DATA — if a file doesn't exist, returns null. Never invent data.
 */

import type { SofascoreMatchData, SofascorePlayerSeasonStats, SofascoreGameLog } from "@/lib/sports/sofascore";

// GitHub raw URL base — public repo, no auth required.
const REPO = "FadsDV/sports-analytics";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

export interface StaticPlayerData {
  collectedAt:  string;
  playerId:     number;
  seasonStats:  SofascorePlayerSeasonStats | null;
  recentGames:  SofascoreGameLog[];
  vsOpponent:   SofascoreGameLog[];
}

export interface StaticSoccerEvent extends SofascoreMatchData {
  collectedAt:  string;
  espnGameId?:  string;
}

async function fetchRaw(path: string): Promise<unknown | null> {
  const url = `${RAW_BASE}/${path}`;
  try {
    const resp = await fetch(url, {
      next: { revalidate: 60 }, // Vercel: refresh every 60s
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null; // 404 = file not yet collected
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Fetch pre-collected Sofascore match data (lineups, team stats, top scorers).
 * Returns null if the file doesn't exist yet.
 */
export async function fetchStaticSoccerEvent(sofascoreId: number): Promise<StaticSoccerEvent | null> {
  const data = await fetchRaw(`data/soccer/events/${sofascoreId}.json`);
  if (!data || typeof data !== "object") return null;
  return data as StaticSoccerEvent;
}

/**
 * Fetch pre-collected player data (season stats + recent game log).
 * Returns null if the file doesn't exist yet.
 */
export async function fetchStaticPlayerData(playerId: number): Promise<StaticPlayerData | null> {
  const data = await fetchRaw(`data/soccer/players/${playerId}.json`);
  if (!data || typeof data !== "object") return null;
  return data as StaticPlayerData;
}

/**
 * Look up the Sofascore event ID for a given ESPN game ID from the index file.
 * The collector script maintains data/soccer/index.json mapping espnGameId → sofascoreId.
 */
export async function lookupSofascoreId(espnGameId: string): Promise<number | null> {
  const index = await fetchRaw("data/soccer/index.json") as Record<string, number> | null;
  if (!index) return null;
  return index[espnGameId] ?? null;
}
