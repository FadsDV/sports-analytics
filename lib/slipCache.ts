/**
 * Slip cache — persists kitchen slips to Vercel Blob so live/resulted games
 * always serve the frozen pre-kickoff slip rather than recomputing.
 *
 * Blob path: slips/{gameId}.json  e.g. "slips/afl-1133570.json"
 *
 * Strategy:
 *   - Pre-match:  always recompute (improving as we get closer to kickoff)
 *   - Live/post:  read from Blob if exists; if not, compute + write once
 *
 * Falls back silently when BLOB_READ_WRITE_TOKEN is not configured (local dev).
 */

import type { KitchenSlip as AflKitchenSlip } from "@/lib/sports/afl/kitchen";
import type { SoccerKitchenSlip } from "@/lib/sports/soccer/kitchen";
import type { NBAKitchenSlip } from "@/lib/sports/nba/kitchen";

export interface CachedSlips {
  afl?:       AflKitchenSlip[];
  soccer?:    SoccerKitchenSlip[];
  nba?:       NBAKitchenSlip[];
  savedAt:    string;
  gameState:  string;
}

function blobAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function slipPath(gameId: string): string {
  return `slips/${gameId}.json`;
}

export async function getSlipCache(gameId: string): Promise<CachedSlips | null> {
  if (!blobAvailable()) return null;
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: slipPath(gameId), limit: 1 });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as CachedSlips;
  } catch {
    return null;
  }
}

export async function saveSlipCache(
  gameId:    string,
  slips:     Omit<CachedSlips, "savedAt" | "gameState">,
  gameState: string,
): Promise<void> {
  if (!blobAvailable()) return;
  try {
    const { list, put } = await import("@vercel/blob");
    // Only write if no existing entry — never overwrite a frozen slip
    const { blobs } = await list({ prefix: slipPath(gameId), limit: 1 });
    if (blobs.length > 0) return;

    const payload: CachedSlips = {
      ...slips,
      savedAt:  new Date().toISOString(),
      gameState,
    };
    await put(slipPath(gameId), JSON.stringify(payload), {
      access:            "public",
      addRandomSuffix:   false,
      contentType:       "application/json",
    });
  } catch {
    // non-fatal — fail silently
  }
}
