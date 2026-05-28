/**
 * AFL Odds Cache — Vercel Blob-backed storage for real bookmaker prices.
 *
 * Written by the /api/odds/upload endpoint (local scraper on home PC).
 * Read by fetchAFLPlayerProps (page.tsx) and the cron save-slips route BEFORE
 * falling through to The Odds API, so real prices take priority.
 *
 * Blob path: odds-cache/{gameId}.json
 * Key format: normalizedPlayerName|stat|line  (3 parts, same as propOdds Map)
 *
 * Freshness is event-aware when kickoff/expires metadata is available:
 * scrape data can remain valid through kickoff and until a configured
 * post-game expiry time.
 *
 * Legacy fallback TTL: 4 hours — stale odds fall through to The Odds API.
 * Falls back silently when BLOB_READ_WRITE_TOKEN is not set.
 */

import { normalizeAFLName } from "./fantasyMapper";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OddsEntry {
  price:     number;
  line:      number;
  bookmaker: string;
}

interface OddsBlob {
  updatedAt: number;
  sourceUpdatedAt?: number;
  kickoffAt?: number;
  expiresAt?: number;
  entries:   Record<string, OddsEntry>;
}

export interface OddsLeg {
  player: string;   // full player name as displayed on bookie site
  stat:   string;   // "D" | "G" | "M" | "T" | "K" | "H" | "HO"
  line:   number;   // e.g. 20.5
  price:  number;   // decimal odds e.g. 1.85
}

export interface OddsUploadPayload {
  gameId:    string;   // e.g. "afl-1133580"
  bookie:    string;   // "bet365" | "dabble" | "sportsbet" | "ladbrokes"
  timestamp: number;   // unix ms — used to detect stale payloads
  kickoffAt?: number;  // unix ms — optional event-aware freshness
  expiresAt?: number;  // unix ms — optional event-aware expiry
  legs:      OddsLeg[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ODDS_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function blobPath(gameId: string): string {
  return `odds-cache/${gameId}.json`;
}

function blobAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Reads cached odds for a game from Vercel Blob.
 * Returns null when:
 *   - BLOB_READ_WRITE_TOKEN not set (local dev)
 *   - No cache exists for this game
 *   - Cache has passed expiresAt when present
 *   - Cache is older than 4 hours when no expiresAt is present
 *
 * Map keys are "normalizedName|stat|line" — same format as the propOdds Map
 * used by computeAFLKitchen, so it slots in as a drop-in replacement.
 */
export async function fetchOddsFromBlob(
  gameId: string,
): Promise<Map<string, OddsEntry> | null> {
  if (!blobAvailable()) return null;

  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: blobPath(gameId) });
    const blob = blobs.find(b => b.pathname === blobPath(gameId));
    if (!blob) return null;

    // Short cache on the fetch itself — blob content changes when scraper pushes new data
    const res = await fetch(blob.url, { next: { revalidate: 60 } });
    if (!res.ok) return null;

    const data: OddsBlob = await res.json();
    const now = Date.now();
    if (typeof data.expiresAt === "number") {
      if (now > data.expiresAt) {
        console.info(`[oddsCache] ${gameId} cache expired at event window (${new Date(data.expiresAt).toISOString()})`);
        return null;
      }
    } else if (now - data.updatedAt > ODDS_TTL_MS) {
      console.info(`[oddsCache] ${gameId} cache expired (age ${Math.round((now - data.updatedAt) / 60_000)}m)`);
      return null;
    }

    const map = new Map<string, OddsEntry>();
    for (const [key, entry] of Object.entries(data.entries)) {
      map.set(key, entry);
    }

    console.info(`[oddsCache] ${gameId}: loaded ${map.size} entries from Blob`);
    return map.size > 0 ? map : null;
  } catch (err) {
    console.warn("[oddsCache] fetchOddsFromBlob error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Writes/merges bookmaker odds for a game into Vercel Blob.
 *
 * Merges with any existing entries so that data from different bookies
 * for the same game accumulates. Entries from the same bookie are overwritten
 * (latest upload wins for each player+stat+line+bookie combination).
 *
 * Keys stored: normalizedName|stat|line|bookie  (4 parts, for multi-bookie storage)
 * When reading back, the bookie suffix is stripped and the entry is keyed
 * normalizedName|stat|line (3 parts) — highest price wins when multiple bookies
 * have the same player+stat+line.
 */
export async function saveOddsToBlob(payload: OddsUploadPayload): Promise<void> {
  if (!blobAvailable()) {
    console.warn("[oddsCache] BLOB_READ_WRITE_TOKEN not set — odds not saved");
    return;
  }

  const { put, list } = await import("@vercel/blob");

  // Load existing Blob data to merge bookies
  let existing: OddsBlob = { updatedAt: 0, entries: {} };
  try {
    const { blobs } = await list({ prefix: blobPath(payload.gameId) });
    const blob = blobs.find(b => b.pathname === blobPath(payload.gameId));
    if (blob) {
      const res = await fetch(blob.url);
      if (res.ok) existing = await res.json();
    }
  } catch {
    // Start fresh if read fails
  }

  // Merge: overwrite entries for this bookie, keep entries from other bookies
  const entries: Record<string, OddsEntry> = { ...existing.entries };

  // Remove old entries from this bookie (to handle market removals)
  const bookieSuffix = `|${payload.bookie}`;
  for (const key of Object.keys(entries)) {
    if (key.endsWith(bookieSuffix)) delete entries[key];
  }

  // Add new entries
  for (const leg of payload.legs) {
    const normalizedName = normalizeAFLName(leg.player);
    if (!normalizedName) continue;
    const key = `${normalizedName}|${leg.stat.toUpperCase()}|${leg.line}|${payload.bookie}`;
    entries[key] = { price: leg.price, line: leg.line, bookmaker: payload.bookie };
  }

  const data: OddsBlob = {
    updatedAt:       Date.now(),
    sourceUpdatedAt: payload.timestamp,
    kickoffAt:       payload.kickoffAt ?? existing.kickoffAt,
    expiresAt:       payload.expiresAt ?? existing.expiresAt,
    entries,
  };
  await put(blobPath(payload.gameId), JSON.stringify(data), {
    access:          "public",
    allowOverwrite:  true,
  });

  console.info(`[oddsCache] ${payload.gameId}: saved ${payload.legs.length} legs from ${payload.bookie}`);
}

// ─── Convert stored blob to propOdds Map ──────────────────────────────────────

/**
 * Converts raw Blob entries (4-part keys: name|stat|line|bookie) to the
 * 3-part format (name|stat|line) expected by computeAFLKitchen / findBestProp.
 *
 * When multiple bookies have the same player+stat+line, the highest decimal
 * price (best odds for the bettor) wins.
 */
export function blobEntriesToPropOdds(
  entries: Record<string, OddsEntry>,
): Map<string, OddsEntry> {
  const map = new Map<string, OddsEntry>();

  for (const [key, entry] of Object.entries(entries)) {
    const parts = key.split("|");
    if (parts.length < 4) continue;  // unexpected format — skip
    const lookupKey = parts.slice(0, 3).join("|");

    const existing = map.get(lookupKey);
    if (!existing || entry.price > existing.price) {
      map.set(lookupKey, entry);
    }
  }

  return map;
}
