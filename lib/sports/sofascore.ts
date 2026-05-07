/**
 * Sofascore unofficial API — free, no key required.
 * Personal use only.
 *
 * NOTE: Sofascore returns 403 to Node.js built-in fetch (TLS fingerprint
 * detection). We route all requests through curl via execFile so the TLS
 * handshake looks like a real browser.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BASE = "https://api.sofascore.com/api/v1";
const CURL_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Simple in-process cache ──────────────────────────────────────────────────

const CACHE = new Map<string, { data: unknown; expires: number }>();

async function sofaFetch(url: string, ttlSeconds = 300): Promise<unknown> {
  const now = Date.now();
  const hit = CACHE.get(url);
  if (hit && now < hit.expires) {
    console.info("[SportsPulse/sofascore] cache hit", { url });
    return hit.data;
  }

  console.info("[SportsPulse/sofascore] curl fetch", { url });
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "--compressed",
        "--max-time", "12",
        "-H", "Accept: application/json",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-H", "Referer: https://www.sofascore.com/",
        "-H", "Origin: https://www.sofascore.com",
        "-A", CURL_UA,
        url,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    ));
    console.info("[SportsPulse/sofascore] curl ok", { url, bytes: stdout.length });
  } catch (err) {
    console.error("[SportsPulse/sofascore] curl error", { url, err: String(err) });
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch (err) {
    console.error("[SportsPulse/sofascore] JSON parse error", { url, err: String(err), preview: stdout.slice(0, 200) });
    return null;
  }

  CACHE.set(url, { data, expires: now + ttlSeconds * 1000 });
  return data;
}

// ─── Sport slug mapping ───────────────────────────────────────────────────────

const SPORT_SLUG: Record<string, string> = {
  soccer:     "football",
  ucl:        "football",
  uel:        "football",
  laliga:     "football",
  bundesliga: "football",
  aleague:    "football",
  basketball: "basketball",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SofascorePlayer {
  id:            number;
  name:          string;
  shortName:     string;
  position:      string;
  jerseyNumber:  string;
  starter:       boolean;
  minutesPlayed?: number;
  rating?:       number;
  stats:         Record<string, number | null>;
}

export interface SofascoreLineup {
  confirmed:       boolean;
  homeFormation?:  string;
  awayFormation?:  string;
  home:            SofascorePlayer[];
  away:            SofascorePlayer[];
}

export interface SofascoreIncident {
  type:           "goal" | "card" | "substitution" | "var" | "other";
  minute:         number;
  addedTime?:     number;
  isHome:         boolean;
  playerName?:    string;
  assistName?:    string;
  playerInName?:  string;
  playerOutName?: string;
  incidentClass?: string; // "regular", "penalty", "ownGoal", "yellow", "red", "yellowRed"
  description?:   string;
}

export interface SofascoreMatchData {
  sofascoreId: number;
  lineups:     SofascoreLineup | null;
  incidents:   SofascoreIncident[];
}

// ─── Name normalisation ───────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining/accent chars
    .toLowerCase()
    .replace(/\bfc\b|\bcf\b|\bafc\b|\bsc\b|\bac\b|\bas\b|\bss\b|\brc\b|\bcd\b|\bud\b|\bsd\b/g, "")
    .replace(/\b(real|atletico|atletico|sporting|united|city)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function namesMatch(sofaName: string, espnName: string): boolean {
  const na = normalizeName(sofaName);
  const nb = normalizeName(espnName);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // prefix match (handles "Arsenal FC" vs "Arsenal")
  const short = na.length < nb.length ? na : nb;
  const long  = na.length < nb.length ? nb : na;
  if (short.length >= 5 && long.startsWith(short)) return true;
  return false;
}

// ─── Find Sofascore event ID ──────────────────────────────────────────────────

/**
 * Finds the Sofascore event ID by matching date + team names against
 * Sofascore's scheduled-events endpoint.
 */
export async function findSofascoreEventId(
  sport:         string,
  homeTeamName:  string,
  awayTeamName:  string,
  kickoffISO:    string
): Promise<number | null> {
  const slug = SPORT_SLUG[sport];
  if (!slug) {
    console.warn("[SportsPulse/sofascore] no slug for sport", { sport });
    return null;
  }

  console.info("[SportsPulse/sofascore] findSofascoreEventId", {
    sport, homeTeamName, awayTeamName, kickoffISO,
    homeNorm: normalizeName(homeTeamName),
    awayNorm: normalizeName(awayTeamName),
  });

  // Try the game date first, then ±1 day to cover timezone edge cases
  const base = new Date(kickoffISO);
  const datesToTry = [0, -1, 1].map((off) => {
    const d = new Date(base);
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  });

  for (const dateStr of datesToTry) {
    const url  = `${BASE}/sport/${slug}/scheduled-events/${dateStr}`;
    const data = await sofaFetch(url, 3600) as Record<string, unknown> | null;
    if (!data) continue;

    const events: unknown[] = (data.events as unknown[]) ?? [];
    console.info("[SportsPulse/sofascore] scanning events", { dateStr, count: events.length });

    for (const e of events) {
      const ev = e as Record<string, unknown>;
      const home = (ev.homeTeam as Record<string, unknown>)?.name as string ?? "";
      const away = (ev.awayTeam as Record<string, unknown>)?.name as string ?? "";
      if (namesMatch(home, homeTeamName) && namesMatch(away, awayTeamName)) {
        console.info("[SportsPulse/sofascore] event match found", { id: ev.id, home, away });
        return ev.id as number;
      }
    }
    console.info("[SportsPulse/sofascore] no match on date", { dateStr,
      homeNorm: normalizeName(homeTeamName), awayNorm: normalizeName(awayTeamName) });
  }

  console.warn("[SportsPulse/sofascore] event not found", { sport, homeTeamName, awayTeamName, kickoffISO });
  return null;
}

// ─── Fetch lineups ────────────────────────────────────────────────────────────

export async function fetchSofascoreLineups(
  sofascoreId: number,
  _sport:      string
): Promise<SofascoreLineup | null> {
  const url  = `${BASE}/event/${sofascoreId}/lineups`;
  const data = await sofaFetch(url, 300) as Record<string, unknown> | null;
  if (!data) return null;

  const parseTeam = (side: unknown): SofascorePlayer[] => {
    const s = side as Record<string, unknown>;
    return ((s?.players as unknown[]) ?? []).map((raw): SofascorePlayer => {
      const p = raw as Record<string, unknown>;
      const player  = p.player  as Record<string, unknown> ?? {};
      const statObj = p.statistics as Record<string, unknown> ?? {};

      const stats: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(statObj)) {
        stats[k] = typeof v === "number" ? v : null;
      }

      // Fix: resolve minutesPlayed separately to avoid ternary precedence bug
      const minsPlayed: number | undefined =
        statObj.minutesPlayed != null
          ? (statObj.minutesPlayed as number)
          : statObj.secondsPlayed != null
          ? Math.round((statObj.secondsPlayed as number) / 60)
          : undefined;

      return {
        id:            (player.id as number) ?? 0,
        name:          (player.name  as string) ?? "Unknown",
        shortName:     (player.shortName as string) ?? (player.name as string) ?? "Unknown",
        position:      (p.position as string) ?? (player.position as string) ?? "?",
        jerseyNumber:  String(p.jerseyNumber ?? p.shirtNumber ?? ""),
        starter:       !(p.substitute as boolean),
        minutesPlayed: minsPlayed,
        rating:        statObj.rating != null ? (statObj.rating as number) : undefined,
        stats,
      };
    });
  };

  const d = data as Record<string, unknown>;
  return {
    confirmed:      Boolean(d.confirmed),
    homeFormation:  (d.home as Record<string, unknown>)?.formation as string | undefined,
    awayFormation:  (d.away as Record<string, unknown>)?.formation as string | undefined,
    home:           parseTeam(d.home),
    away:           parseTeam(d.away),
  };
}

// ─── Fetch incidents ──────────────────────────────────────────────────────────

export async function fetchSofascoreIncidents(
  sofascoreId: number
): Promise<SofascoreIncident[]> {
  const url  = `${BASE}/event/${sofascoreId}/incidents`;
  const data = await sofaFetch(url, 300) as Record<string, unknown> | null;
  if (!data) return [];

  const raw = (data.incidents as unknown[]) ?? [];

  return (raw
    .map((item): SofascoreIncident | null => {
      const i = item as Record<string, unknown>;
      const rawType   = i.incidentType as string;
      const minute    = (i.time ?? i.minute ?? 0) as number;
      const isHome    = Boolean(i.isHome);
      const getPlayer = (key: string) =>
        ((i[key] as Record<string, unknown>)?.name as string | undefined);

      if (rawType === "goal") {
        return {
          type: "goal", minute, addedTime: i.addedTime as number | undefined,
          isHome,
          playerName:   getPlayer("player"),
          assistName:   getPlayer("assist1"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "card") {
        return {
          type: "card", minute, addedTime: i.addedTime as number | undefined,
          isHome,
          playerName:   getPlayer("player"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "substitution") {
        return {
          type: "substitution", minute, isHome,
          playerInName:  getPlayer("playerIn"),
          playerOutName: getPlayer("playerOut"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "varDecision") {
        return {
          type: "var", minute, isHome,
          playerName:  getPlayer("player"),
          description: i.incidentClass as string | undefined,
        };
      }
      return null;
    })
    .filter(Boolean) as SofascoreIncident[])
    .reverse(); // Sofascore returns newest first — reverse to oldest first
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Fetches lineups + incidents for a game.
 * Returns null if the game can't be found on Sofascore.
 */
export async function fetchSofascoreMatchData(
  sport:        string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffISO:   string
): Promise<SofascoreMatchData | null> {
  console.info("[SportsPulse/sofascore] fetchSofascoreMatchData start", {
    sport, homeTeamName, awayTeamName, kickoffISO
  });

  const sofascoreId = await findSofascoreEventId(
    sport, homeTeamName, awayTeamName, kickoffISO
  );
  if (!sofascoreId) {
    console.warn("[SportsPulse/sofascore] fetchSofascoreMatchData: no sofascoreId, returning null");
    return null;
  }

  console.info("[SportsPulse/sofascore] fetching lineups + incidents", { sofascoreId });
  const [lineups, incidents] = await Promise.all([
    fetchSofascoreLineups(sofascoreId, sport),
    fetchSofascoreIncidents(sofascoreId),
  ]);

  console.info("[SportsPulse/sofascore] fetchSofascoreMatchData done", {
    sofascoreId,
    hasLineups: Boolean(lineups),
    homePlayers: lineups?.home.length ?? 0,
    awayPlayers: lineups?.away.length ?? 0,
    incidents: incidents.length,
  });

  return { sofascoreId, lineups, incidents };
}
