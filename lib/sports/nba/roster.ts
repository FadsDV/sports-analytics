/**
 * NBA roster provider.
 * Source of truth: ESPN public roster API (/basketball/nba/teams/{id}/roster).
 * Headshots: ESPN CDN (nba/players/full/{id}.png) — not soccer, not generic.
 * Returns complete active rosters; not limited to game-day lineups.
 */

import type { ESPNPlayer } from "@/lib/sports/espnPlayers";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_HS = "https://a.espncdn.com/i/headshots/nba/players/full";

// ── Position normalisation ─────────────────────────────────────────────────────

const POS_MAP: Record<string, string> = {
  "point guard":    "PG",
  "shooting guard": "SG",
  "small forward":  "SF",
  "power forward":  "PF",
  "center":         "C",
  "guard":          "G",
  "forward":        "F",
  "forward-center": "F-C",
  "guard-forward":  "G-F",
};

function normalizePosition(raw: string): string {
  return POS_MAP[raw.toLowerCase()] ?? raw.toUpperCase();
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function fetchNBATeamRoster(teamId: string): Promise<ESPNPlayer[]> {
  const url = `${BASE}/teams/${teamId}/roster`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) {
      console.warn(`[SportsPulse] NBA roster fetch failed — team:${teamId} status:${res.status}`);
      return [];
    }
    const data = await res.json();
    const players = parseNBARoster(data);
    console.info(`[SportsPulse] NBA roster — team:${teamId} count:${players.length}`);
    return players;
  } catch (err) {
    console.error("[SportsPulse] NBA roster error", { teamId, err });
    return [];
  }
}

function parseNBARoster(data: any): ESPNPlayer[] {
  // ESPN returns positional groups: [{ position: "Guards", items: [...] }, ...]
  const groups: any[] = data.athletes ?? data.roster ?? [];
  const result: ESPNPlayer[] = [];

  for (const group of groups) {
    const groupPos = group.position?.abbreviation ?? "";
    const items: any[] = group.items ?? (Array.isArray(group) ? group : [group]);

    for (const p of items) {
      const player = parsePlayer(p, groupPos);
      if (player) result.push(player);
    }
  }

  return result;
}

function parsePlayer(p: any, groupPos: string): ESPNPlayer | null {
  const rawId = p.id ?? p.athlete?.id;
  if (!rawId) return null;
  const id = String(rawId);

  // Prefer ESPN-provided headshot URL; fall back to NBA CDN pattern (reliable for active players)
  const headshotRaw =
    p.headshot?.href ??
    p.headshot?.url ??
    p.athlete?.headshot?.href ??
    p.athlete?.headshot?.url;
  const headshot = headshotRaw ?? `${ESPN_HS}/${id}.png`;

  const rawPos =
    p.position?.displayName ??
    p.position?.name ??
    p.position?.abbreviation ??
    p.athlete?.position?.displayName ??
    groupPos;
  const posAbbr =
    p.position?.abbreviation ??
    p.athlete?.position?.abbreviation ??
    normalizePosition(rawPos);
  const posFull =
    p.position?.displayName ??
    p.position?.name ??
    p.athlete?.position?.displayName;

  return {
    id,
    displayName: (
      p.displayName ??
      p.fullName ??
      p.athlete?.displayName ??
      `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()
    ) || "Unknown",
    jersey:       p.jersey ?? p.jerseyNumber ?? p.athlete?.jersey,
    position:     normalizePosition(posAbbr),
    positionFull: posFull,
    age:          p.age ?? p.athlete?.age,
    headshot,
    seasonStats:  {},
  };
}
